// База на ветку: локальный Postgres (brew) подстраивается под текущую ветку git сам.
//
// Ветки меняют схему независимо, а сервер локально один. Миграция одной ветки
// оставалась в базе после checkout на другую: лишняя NOT NULL колонка ломала
// вставки там, где её не знают, а миграция, перегенерированная после развилки,
// оставляла в журнале запись, которой в коде нет. Поэтому у каждой ветки своя
// база на том же сервере, и выбирается она при запуске, а не env-файлом:
//
//   {{MAIN_BRANCH}}        → {{DB_NAME}} (имя из DATABASE_URL)
//   любая другая    → {{DB_NAME}}__<ветка>
//
// Сервер это brew-сервис, а не контейнер и не процесс под dev: база обязана
// пережить перезапуск dev, и на том же сервере живут базы других проектов.
// Поэтому скрипт сервер только поднимает, если тот не отвечает, и никогда не
// останавливает. Чужие базы он не трогает: работает только с именами
// {{DB_NAME}} и {{DB_NAME}}__*.
//
// DATABASE_URL уходит процессу переменной окружения: и dotenv, и tsx
// --env-file, и drizzle-kit уже заданное значение из .env не перетирают.
// Env-файлы не меняются.
//
// prepare() перед запуском: поднимает Postgres, для worktree без env-файлов
// копирует их из основной папки, создаёт базу ветки копией базы {{MAIN_BRANCH}}
// (pg_dump во временный файл и pg_restore, основную базу останавливать не
// нужно), лечит базу ветки, если её журнал миграций разошёлся с кодом
// (пересоздаёт из {{MAIN_BRANCH}}; базу {{MAIN_BRANCH}} не трогает никогда,
// останавливается и объясняет), и применяет миграции. Два запуска разом (превью
// web и api) идут по очереди под файловой блокировкой: иначе оба создадут базу
// и оба применят миграцию.
//
// Клиенты (psql, pg_dump, pg_restore) берутся из той же brew-формулы, что и
// сервер: pg_dump младше сервера отказывается работать, а формулы
// postgresql@NN keg-only, и в PATH их может не быть.
//
// Команды: migrate · run [--fresh] -- <команда> · up · reset [--fresh] ·
// list · prune [--yes]. --fresh: новая база пустая, только миграции (и сид,
// если в {{DB_PKG}} есть скрипт seed).
// Только локально: прод мигрирует сам бэкенд на старте, этот скрипт там не живёт.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAIN_BRANCHES = new Set(['{{MAIN_BRANCH}}']);
const ENV_FILES = ['{{API_DIR}}/.env', '{{DB_DIR}}/.env', '.env.local'];
const DB_PKG = '{{DB_PKG}}';
const JOURNAL = '{{DB_DIR}}/migrations/meta/_journal.json';
const LOCK_STALE_MS = 5 * 60_000;

const log = (msg) => console.log(`db: ${msg}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(cmd, args, opts = {}) {
  const out = execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
  return (out ?? '').trim();
}

function tryRun(cmd, args, opts) {
  try {
    return run(cmd, args, opts);
  } catch {
    return null;
  }
}

export function gitDir() {
  return run('git', ['rev-parse', '--absolute-git-dir']);
}

function mainWorktree() {
  return path.dirname(run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir']));
}

/** null: HEAD отцеплен (rebase, bisect). */
export function currentBranch() {
  return tryRun('git', ['symbolic-ref', '--short', '-q', 'HEAD']) || null;
}

/** Имя базы ветки; не больше 63 байт, это предел идентификатора Postgres. */
export function dbNameFor(branch, base) {
  if (branch && MAIN_BRANCHES.has(branch)) return base;
  const slug = (branch ?? 'detached')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const name = `${base}__${slug}`;
  if (name.length <= 63) return name;
  const hash = createHash('sha1').update(branch).digest('hex').slice(0, 8);
  return `${name.slice(0, 54)}_${hash}`;
}

function readEnvVar(file, key) {
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1] === key) return m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return undefined;
}

/** Базовый адрес (база {{MAIN_BRANCH}}) из env-файлов этой папки, иначе основной. */
function baseUrl() {
  for (const dir of [ROOT, mainWorktree()]) {
    for (const file of ENV_FILES) {
      const url = readEnvVar(path.join(dir, file), 'DATABASE_URL');
      if (url) return new URL(url);
    }
  }
  throw new Error('DATABASE_URL не найден ни в одном env-файле. Скопируй .env.example в .env.');
}

function withDb(url, name) {
  const next = new URL(url);
  next.pathname = `/${name}`;
  return next.toString();
}

function assertLocal(url) {
  // Скрипт создаёт и удаляет базы: чужой сервер ему трогать нельзя ни при каких env.
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error(
      `DATABASE_URL смотрит на ${url.hostname}, а скрипт работает только с localhost`,
    );
  }
}

// ── Postgres из brew ────────────────────────────────────────────────────────

/** Первая установленная формула postgresql@NN (или postgresql); null, если brew нет. */
function brewFormula() {
  const list = tryRun('brew', ['list', '--formula']);
  if (!list) return null;
  return list.split('\n').find((f) => /^postgresql(@\d+)?$/.test(f)) ?? null;
}

let binDir;
/** Путь к клиенту той же формулы, что и сервер; иначе из PATH. */
function pgBin(tool) {
  if (binDir === undefined) {
    const formula = brewFormula();
    const prefix = formula ? tryRun('brew', ['--prefix', formula]) : null;
    binDir =
      prefix && existsSync(path.join(prefix, 'bin', 'psql')) ? path.join(prefix, 'bin') : null;
  }
  return binDir ? path.join(binDir, tool) : tool;
}

function isReady(url) {
  return tryRun(pgBin('pg_isready'), ['-q', '-h', url.hostname, '-p', url.port || '5432']) !== null;
}

export async function ensurePostgres(url) {
  assertLocal(url);
  if (isReady(url)) return;
  const formula = brewFormula();
  if (!formula) {
    throw new Error(
      `на ${url.hostname}:${url.port || 5432} никто не отвечает, а brew-формулы postgresql нет. ` +
        `Установи: brew install postgresql@17 && brew services start postgresql@17`,
    );
  }
  log(`поднимаю ${formula} (brew services)…`);
  run('brew', ['services', 'start', formula]);
  // brew отдаёт управление раньше, чем сервер начинает принимать соединения.
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (isReady(url)) return;
    await sleep(300);
  }
  throw new Error(`${formula} не принял соединение за 15 с, смотри brew services list`);
}

function psql(url, db, sql) {
  return run(pgBin('psql'), [withDb(url, db), '-v', 'ON_ERROR_STOP=1', '-Atc', sql]);
}

const ident = (name) => `"${name.replace(/"/g, '""')}"`;
const literal = (s) => `'${s.replace(/'/g, "''")}'`;

function dbExists(url, name) {
  return (
    psql(url, 'postgres', `select 1 from pg_database where datname = ${literal(name)}`) === '1'
  );
}

function listDbs(url) {
  return psql(url, 'postgres', 'select datname from pg_database where not datistemplate')
    .split('\n')
    .filter(Boolean);
}

function dropDb(url, name) {
  psql(url, 'postgres', `drop database if exists ${ident(name)} with (force)`);
}

/** Копия base в name через дамп во временный файл: без шелла и без кавычек в адресах. */
function copyDb(url, base, name) {
  const dump = path.join(os.tmpdir(), `branch-db-${process.pid}-${Date.now()}.dump`);
  try {
    run(pgBin('pg_dump'), ['-Fc', '-f', dump, withDb(url, base)]);
    run(pgBin('pg_restore'), [
      '--no-owner',
      '--no-acl',
      '--exit-on-error',
      '-d',
      withDb(url, name),
      dump,
    ]);
  } finally {
    rmSync(dump, { force: true });
  }
}

/**
 * Новая база. Копия базы {{MAIN_BRANCH}}, если это ветка и копия подходит; пустая
 * (дальше миграции и сид), если это сама основная база, просили --fresh,
 * основной базы нет или копия не подходит коду ветки: ветка отстала от
 * {{MAIN_BRANCH}}, и в копии есть миграции, которых у неё нет.
 */
function createDb(url, name, base, fresh) {
  psql(url, 'postgres', `create database ${ident(name)}`);
  if (name === base || fresh || !dbExists(url, base)) return 'fresh';
  copyDb(url, base, name);
  const stale = staleReason(url, name);
  if (!stale) return 'copy';
  log(`копия ${base} не подходит ветке (${stale.text}), база будет пустой`);
  dropDb(url, name);
  psql(url, 'postgres', `create database ${ident(name)}`);
  return 'fresh';
}

/**
 * Почему журнал базы разошёлся с кодом; null, если не разошёлся. kind: unknown,
 * если в базе есть миграция, которой нет в коде (схема могла уехать вперёд);
 * skipped, если миграция кода старше последней применённой и мигратор её молча
 * пропустит.
 */
function staleReason(url, name) {
  const table = psql(url, name, `select to_regclass('drizzle.__drizzle_migrations')`);
  if (!table) return null;
  const applied = psql(url, name, 'select created_at from drizzle.__drizzle_migrations')
    .split('\n')
    .filter(Boolean)
    .map(Number);
  if (applied.length === 0) return null;
  const journalPath = path.join(ROOT, JOURNAL);
  const journal = existsSync(journalPath)
    ? JSON.parse(readFileSync(journalPath, 'utf8')).entries
    : [];
  const known = new Set(journal.map((e) => e.when));
  const unknown = applied.filter((when) => !known.has(when));
  if (unknown.length > 0) {
    return { kind: 'unknown', text: `в базе ${unknown.length} миграц. которых нет в коде` };
  }
  const last = Math.max(...applied);
  const skipped = journal.filter((e) => e.when < last && !applied.includes(e.when));
  if (skipped.length > 0) {
    return {
      kind: 'skipped',
      text: `${skipped.map((e) => e.tag).join(', ')} старше последней применённой, мигратор их пропустит`,
    };
  }
  return null;
}

// ── Подготовка ──────────────────────────────────────────────────────────────

/** Worktree без env-файлов получает копии из основной папки. */
function ensureEnvFiles() {
  const main = mainWorktree();
  if (main === ROOT) return;
  for (const file of ENV_FILES) {
    const target = path.join(ROOT, file);
    const source = path.join(main, file);
    if (!existsSync(target) && existsSync(source)) {
      copyFileSync(source, target);
      log(`скопирован ${file} из основной папки`);
    }
  }
}

async function withLock(fn) {
  const common = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const lock = path.join(common, 'branch-db.lock');
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      const age = existsSync(lock) ? Date.now() - statSync(lock).mtimeMs : 0;
      if (age > LOCK_STALE_MS) rmSync(lock, { recursive: true, force: true });
      else await sleep(500);
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

function migrate(env) {
  // Ни одной миграции ещё нет: мигрировать нечего, drizzle-kit упал бы на пустой папке.
  if (!existsSync(path.join(ROOT, JOURNAL))) return;
  try {
    run('npm', ['run', 'migrate', '-w', DB_PKG], { env: { ...process.env, ...env } });
  } catch (error) {
    process.stderr.write(`${error.stdout ?? ''}${error.stderr ?? ''}`);
    throw new Error('миграции не применились, вывод drizzle-kit выше');
  }
}

function seed(env) {
  const pkgFile = path.join(ROOT, '{{DB_DIR}}/package.json');
  if (!existsSync(pkgFile) || !JSON.parse(readFileSync(pkgFile, 'utf8')).scripts?.seed) return;
  run('npm', ['run', 'seed', '-w', DB_PKG], { env: { ...process.env, ...env }, stdio: 'inherit' });
}

/** Готовит базу текущей ветки; возвращает окружение для процессов. */
export async function prepare({ fresh = false, reset = false } = {}) {
  ensureEnvFiles();
  const url = baseUrl();
  const base = url.pathname.slice(1);
  const branch = currentBranch();
  const name = dbNameFor(branch, base);
  if (!branch) log(`HEAD отцеплен, база ${name}`);

  await ensurePostgres(url);
  const env = { DATABASE_URL: withDb(url, name) };

  await withLock(async () => {
    if (reset) {
      if (name === base)
        throw new Error(`reset базы ${base} ({{MAIN_BRANCH}}) не делается: это твои данные`);
      dropDb(url, name);
    }
    let made = null;
    if (!dbExists(url, name)) made = createDb(url, name, base, fresh);

    const stale = staleReason(url, name);
    if (stale) {
      // Базу {{MAIN_BRANCH}} не пересоздаём никогда: в ней данные владельца. Лишняя
      // запись миграции мигратору не мешает, только предупреждаем; пропуск
      // миграции мешает, поэтому стоп.
      if (name === base && stale.kind === 'unknown') {
        log(`внимание: база ${base}: ${stale.text}; схема может отличаться от кода`);
      } else if (name === base) {
        throw new Error(
          `журнал миграций базы ${base} разошёлся с кодом: ${stale.text}. Разберись вручную.`,
        );
      } else {
        log(`база ${name}: ${stale.text}, пересоздаю из ${base}`);
        dropDb(url, name);
        made = createDb(url, name, base, fresh);
      }
    }

    migrate(env);
    if (made === 'fresh') seed(env);
    const how = made === 'copy' ? `копия ${base}` : 'пустая';
    log(`${branch ?? 'detached'} → ${name}${made ? ` (создана: ${how})` : ''}`);
  });
  return { branch, name, env };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main(argv) {
  const [command = 'list', ...rest] = argv;
  const fresh = rest.includes('--fresh');

  switch (command) {
    case 'up':
      ensureEnvFiles();
      await ensurePostgres(baseUrl());
      log('Postgres готов');
      return 0;
    case 'migrate':
      await prepare({ fresh });
      return 0;
    case 'reset':
      await prepare({ fresh, reset: true });
      return 0;
    case 'run': {
      const sep = rest.indexOf('--');
      const cmd = sep === -1 ? [] : rest.slice(sep + 1);
      if (cmd.length === 0) throw new Error('run: команда после --');
      const { env } = await prepare({ fresh });
      const child = spawn(cmd[0], cmd.slice(1), {
        cwd: process.cwd(),
        env: { ...process.env, ...env },
        stdio: 'inherit',
      });
      for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
      return new Promise((resolve) =>
        child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0))),
      );
    }
    case 'list':
    case 'prune': {
      const u = baseUrl();
      const base = u.pathname.slice(1);
      await ensurePostgres(u);
      const branches = run('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])
        .split('\n')
        .filter(Boolean);
      // Текущая ветка без коммитов в refs/heads ещё не видна, но её база не сирота.
      const owners = new Map(
        [...branches, currentBranch()].filter(Boolean).map((b) => [dbNameFor(b, base), b]),
      );
      const dbs = listDbs(u).filter((d) => d.startsWith(`${base}__`));
      const orphans = dbs.filter((d) => !owners.has(d));
      log(`${base} ← ${[...MAIN_BRANCHES].join(', ')}`);
      for (const d of dbs) log(`${d} ← ${owners.get(d) ?? '(ветки нет)'}`);
      if (command === 'list') return 0;
      if (orphans.length === 0) {
        log('нечего удалять');
        return 0;
      }
      if (!rest.includes('--yes')) {
        log(`удалю ${orphans.join(', ')}; повтори с --yes`);
        return 0;
      }
      for (const d of orphans) dropDb(u, d);
      log(`удалены: ${orphans.join(', ')}`);
      return 0;
    }
    default:
      throw new Error(
        `неизвестная команда ${command}: migrate | run -- … | up | reset | list | prune`,
      );
  }
}

// Запуск как скрипта, а не импорт (хук и dev.mjs импортируют этот файл). Сравнение
// через realpath и pathToFileURL: путь через симлинк (/tmp → /private/tmp), с
// пробелами или кириллицей иначе не совпадает, и скрипт молча ничего не делает.
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (isMain) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`db: ${error.message}`);
      process.exit(1);
    },
  );
}
