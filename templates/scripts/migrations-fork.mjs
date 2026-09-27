// Развилка миграций между ветками: схему меняют в одной ветке за раз.
//
// drizzle-kit берёт номер следующей миграции из журнала своей ветки. Поменяли
// схему в двух ветках, не сведя их, и обе получают один номер: при мерже
// конфликтуют журнал и цепочка снимков. Хуже то, что мигратор сверяет только
// время последней применённой записи: миграция с `when` меньше уже применённой
// пропускается молча, без ошибки, таблицы просто нет. Поэтому развилку ловим
// до генерации, а не при мерже.
//
// Рабочий журнал сравнивается с журналами всех локальных веток и origin/*
// (worktree делят ссылки git, так что закоммиченное в соседней папке видно без
// fetch). Миграция опознаётся по `when`, а не по тегу: мигратор видит только
// его. Проблемы:
//   1) в другой ветке есть миграция, которой здесь нет (влей её до generate);
//   2) тот же номер с другим тегом (развилка уже случилась);
//   3) своя миграция старше чужой по `when` (после мержа мигратор её пропустит).
// Незакоммиченную миграцию соседнего worktree проверка не видит.
//
// Запуск: npm run db:fork-check. Код выхода 1 при проблеме. Тот же код зовут
// pregenerate в {{DB_DIR}} и хук правки схемы .claude/hooks/schema-reminder.mjs.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JOURNAL = '{{DB_DIR}}/migrations/meta/_journal.json';

function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    ...opts,
  }).trim();
}

function tryGit(args, opts) {
  try {
    return git(args, opts);
  } catch {
    return null;
  }
}

function branchRefs() {
  const out =
    tryGit(['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes/origin']) ??
    '';
  return out.split('\n').filter((ref) => ref && ref !== 'origin' && ref !== 'origin/HEAD');
}

/** Список строк-проблем; пустой список означает, что развилки нет. */
export function checkMigrationFork({ fetch = false } = {}) {
  // Без сети проверка идёт по уже скачанному: лучше старые данные, чем зависший хук.
  if (fetch) tryGit(['fetch', '--quiet', 'origin'], { timeout: 8000 });

  // Журнала ещё нет: ни одной миграции не сгенерировано, развилки быть не может.
  const journalPath = path.join(ROOT, JOURNAL);
  if (!existsSync(journalPath)) return [];

  const local = JSON.parse(readFileSync(journalPath, 'utf8')).entries;
  const localWhen = new Set(local.map((e) => e.when));
  const current = tryGit(['rev-parse', '--abbrev-ref', 'HEAD']);

  const problems = [];
  const seen = new Set();
  for (const ref of branchRefs()) {
    const blob = tryGit(['rev-parse', '--verify', '--quiet', `${ref}:${JOURNAL}`]);
    if (!blob || seen.has(blob)) continue;
    seen.add(blob);
    const other = JSON.parse(git(['cat-file', '-p', blob])).entries;
    const otherWhen = new Set(other.map((e) => e.when));

    const missing = other.filter((e) => !localWhen.has(e.when));
    if (missing.length === 0) continue;
    const label = ref === current ? `${ref} (this branch, committed)` : ref;
    problems.push(
      `${label} has migrations missing here: ${missing.map((e) => e.tag).join(', ')}. ` +
        `Merge it before db:generate, or both branches will take the same number ` +
        `(an abandoned branch: delete it).`,
    );

    for (const theirs of missing) {
      const ours = local.find((e) => e.idx === theirs.idx);
      if (ours && ours.tag !== theirs.tag) {
        problems.push(
          `Collision at ${String(theirs.idx).padStart(4, '0')}: ${ours.tag} here vs ${theirs.tag} in ${ref}.`,
        );
      }
    }

    const newestTheirs = Math.max(...missing.map((e) => e.when));
    for (const ours of local.filter((e) => !otherWhen.has(e.when))) {
      if (ours.when < newestTheirs) {
        problems.push(
          `${ours.tag} is older than ${ref}'s newest migration: once that one is applied, ` +
            `the migrator skips ${ours.tag} silently. Regenerate it after the merge.`,
        );
      }
    }
  }
  return problems;
}

// Запуск как скрипта, а не импорт (хук и dev.mjs импортируют этот файл). Сравнение
// через realpath и pathToFileURL: путь через симлинк (/tmp → /private/tmp), с
// пробелами или кириллицей иначе не совпадает, и скрипт молча ничего не делает.
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (isMain) {
  const problems = checkMigrationFork({ fetch: process.argv.includes('--fetch') });
  if (problems.length === 0) {
    console.log('migrations: no fork with other branches');
  } else {
    for (const p of problems) console.error(`migrations: ${p}`);
    process.exit(1);
  }
}
