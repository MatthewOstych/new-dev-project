import { readFileSync } from 'node:fs';
import path from 'node:path';

// Сверка журнала миграций ветки с тем, что записано применённым в базе.
//
// Мигратор drizzle сверяет только время последней применённой миграции: всё, что
// в журнале старше неё, он считает применённым и пропускает МОЛЧА, без ошибки.
// Так бывает на проде, когда миграции из dev применили к базе раньше, чем они
// попали в main: после мержа часть их тихо не применится, таблиц не будет, а
// процесс стартует как ни в чём не бывало.
//
// Поэтому после миграций бэкенд сверяет журнал с базой и говорит о
// расхождении в логе. Только чтение и только лог: старт это не валит, потому
// что лишняя миграция в базе (ветка старше базы) безвредна, а пропущенную
// чинит человек, и чинит осознанно.
//
// Как чинить пропущенную:
// - локально: `npm run db:reset` пересоздаёт базу ветки (базу основной ветки
//   скрипт не трогает, её пересоздают руками);
// - на проде данные не выбрасывают: SQL пропущенной миграции применяют руками
//   одной транзакцией, а если после этого мигратор принимает какую-то уже
//   применённую миграцию за новую, её помечают применённой строкой в
//   drizzle.__drizzle_migrations с её `when` из meta/_journal.json (хэш мигратор
//   не сверяет). Запись в прод делает человек, не агент.

/** Запись журнала drizzle: тег файла и время, по которому её узнаёт мигратор. */
export type JournalEntry = { tag: string; when: number };

export type MigrationDrift = {
  /** Миграции журнала, которых нет в базе и которые мигратор уже никогда не применит. */
  skipped: string[];
  /** Сколько применённых записей журнал этой ветки не знает: база впереди кода. */
  unknown: number;
};

/**
 * @param journal записи журнала ветки.
 * @param applied `created_at` строк drizzle.__drizzle_migrations: drizzle пишет
 *   туда `when` миграции, по нему записи и сопоставляются.
 */
export function compareMigrations(journal: JournalEntry[], applied: number[]): MigrationDrift {
  const done = new Set(applied);
  const last = applied.length > 0 ? Math.max(...applied) : -Infinity;
  const known = new Set(journal.map((entry) => entry.when));
  return {
    skipped: journal
      .filter((entry) => !done.has(entry.when) && entry.when <= last)
      .map((entry) => entry.tag),
    unknown: applied.filter((when) => !known.has(when)).length,
  };
}

/** Журнал миграций из папки, которую читает и сам мигратор. */
export function readJournal(migrationsFolder: string): JournalEntry[] {
  const file = path.join(migrationsFolder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(file, 'utf8')) as { entries: JournalEntry[] };
  return journal.entries.map(({ tag, when }) => ({ tag, when }));
}

/** Текст для лога. null: расхождения нет. */
export function describeDrift(
  drift: MigrationDrift,
): { level: 'warn' | 'error'; message: string } | null {
  if (drift.skipped.length > 0) {
    return {
      level: 'error',
      message:
        `migrations in this branch's journal were never applied and never will be, ` +
        `because a newer migration is already recorded: ${drift.skipped.join(', ')}. ` +
        `Their tables or columns are missing. Locally: npm run db:reset. In production: ` +
        `apply their SQL by hand; the procedure is in the header of migrationDrift.ts.`,
    };
  }
  if (drift.unknown > 0) {
    return {
      level: 'warn',
      message:
        `the database has ${drift.unknown} migration(s) this branch does not know ` +
        `(it is ahead of the code, usually after switching to an older branch). ` +
        `Harmless unless the extra schema breaks this code.`,
    };
  }
  return null;
}
