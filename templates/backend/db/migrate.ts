import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { compareMigrations, readJournal, type MigrationDrift } from './migrationDrift.js';

// Миграции применяются программно при старте API, до listen, тем же драйвером,
// что и рантайм. Гонять drizzle-kit CLI в проде нельзя: это dev-инструмент, его
// спиннер съедает ошибку подключения, и контейнер уходит в рестарт-цикл без
// единой строчки о причине.
//
// Отдельное соединение с max: 1: миграции должны идти строго последовательно, а
// advisory-блокировка ниже живёт в СЕССИИ, и держать её имеет смысл, только если
// запросы идут по тому же соединению, что и миграции.
//
// Почему блокировка: процессов, стартующих одновременно, со временем станет
// больше одного (реплики API, отдельный воркер). Каждый зовёт runMigrations, а
// drizzle никакой блокировки не берёт: два процесса прочитают один и тот же
// незаполненный журнал и применят одну миграцию дважды. Ключ произволен, но
// ЗАФИКСИРОВАН НАВСЕГДА: сменить его значит завести вторую очередь и вернуть гонку.
const MIGRATION_LOCK_KEY = {{MIGRATION_LOCK_KEY}};

/** Папка миграций рядом с пакетом: и из src (tsx), и из dist (node) это ../migrations. */
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

/**
 * Сколько ждём чужую миграцию, прежде чем сдаться. Ждать бесконечно нельзя:
 * зависший процесс с блокировкой превратил бы деплой в молчание без причины.
 */
const LOCK_WAIT_MS = 60_000;
const LOCK_RETRY_MS = 500;

async function acquireLock(tryLock: () => Promise<boolean>): Promise<void> {
  // Опрос, а не блокирующий pg_advisory_lock: тот повис бы в базе без права на
  // таймаут, и снаружи это неотличимо от зависшего старта.
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    if (await tryLock()) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `Another process has held the migration lock for ${LOCK_WAIT_MS / 1000}s. ` +
          `It is either still migrating or stuck; check the other deployment first.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
  }
}

/**
 * Применить миграции и сверить журнал ветки с базой (migrationDrift). Отвечает
 * расхождением: что с ним делать (писать в лог), решает вызывающий.
 */
export async function runMigrations(databaseUrl: string): Promise<MigrationDrift> {
  // Ни одной миграции ещё нет: применять нечего.
  if (!existsSync(MIGRATIONS_FOLDER)) return { skipped: [], unknown: 0 };

  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await acquireLock(async () => {
      const [row] = await client<
        { locked: boolean }[]
      >`select pg_try_advisory_lock(${MIGRATION_LOCK_KEY}) as locked`;
      return row.locked;
    });
    try {
      await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
      // Сверка после миграций и под той же блокировкой: читаем журнал, который
      // только что записали, а не чужой, недописанный.
      const applied = await client<{ created_at: string }[]>`
        select created_at from drizzle.__drizzle_migrations`;
      return compareMigrations(
        readJournal(MIGRATIONS_FOLDER),
        applied.map((row) => Number(row.created_at)),
      );
    } finally {
      // Ошибку снятия глотаем: она не должна подменить собой ошибку миграции.
      await client`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`.catch(() => {});
    }
  } finally {
    await client.end();
  }
}
