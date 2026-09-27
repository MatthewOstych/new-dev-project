// `npm run dev`: база текущей ветки, веб и API, свободные порты, и перезапуск
// обоих при смене ветки.
//
// База готовится scripts/branch-db.mjs (brew-Postgres, база ветки, миграции) и уходит
// процессам переменной окружения. Checkout при запущенном dev меняет код под
// Next и tsx watch, но не базу: процессы держат старый DATABASE_URL. Поэтому
// HEAD под наблюдением: ветка сменилась, оба процесса останавливаются, база
// готовится заново, оба стартуют. Отцеплённый HEAD (rebase, bisect) не
// перезапускает: это промежуточное состояние, ветка вернётся.
//
// Порты не прибиты: на машине бывают запущены другие проекты, и :3000 или
// :4000 может оказаться чужим. Веб встаёт на первый свободный порт начиная с
// :3000 (или с PORT, его выставляет превью с autoPort), API начиная со своего
// порта проекта :{{API_PORT}} (или с API_PORT); его же ждут мобилки в Debug
// (или с API_PORT). Скрипт связывает их явно: вебу BACKEND_URL, API PORT и
// WEB_ORIGIN. Переменные окружения процесса старше файлов: ни Next, ни
// `tsx --env-file` не перетирают уже заданное значение значением из .env.
//
// Postgres по Ctrl-C не останавливается: это brew-сервис, он обязан пережить
// перезапуск dev (иначе каждый Ctrl-C ронял бы базу посреди записи), и на нём
// живут базы других проектов. dev его никогда не гасит.
import { spawn } from 'node:child_process';
import { existsSync, watch } from 'node:fs';
import { connect } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { currentBranch, gitDir, prepare } from './branch-db.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_PKG = '{{API_PKG}}';
// Веба может не быть (основа приложение, веб не нужен): тогда поднимаем только API.
const HAS_WEB = existsSync(path.join(ROOT, 'next.config.ts'));

let child = null;
let branch = null;
let busy = false;
let stopping = false;
let ports = null;

/** Отвечает ли кто-то на порту. Оба стека: процесс может слушать только ::1. */
function isListening(port) {
  const probe = (host) =>
    new Promise((resolve) => {
      const socket = connect({ port, host });
      socket.setTimeout(300);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => resolve(false));
    });
  return Promise.all([probe('127.0.0.1'), probe('::1')]).then((r) => r.some(Boolean));
}

async function firstFreePort(start, taken = []) {
  for (let port = start; port < start + 50; port++) {
    if (taken.includes(port)) continue;
    if (!(await isListening(port))) return port;
  }
  throw new Error(`нет свободного порта в ${start}..${start + 49}`);
}

async function pickPorts() {
  const web = HAS_WEB ? await firstFreePort(Number(process.env.PORT ?? 3000)) : null;
  const api = await firstFreePort(Number(process.env.API_PORT ?? {{API_PORT}}), web ? [web] : []);
  return { web, api };
}

/** Порты старых процессов освобождаются не в момент их выхода. */
async function waitPortsFree() {
  const list = [ports.web, ports.api].filter(Boolean);
  for (let i = 0; i < 40; i++) {
    const busyPorts = await Promise.all(list.map(isListening));
    if (!busyPorts.some(Boolean)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function start() {
  const prepared = await prepare();
  branch = prepared.branch;
  ports ??= await pickPorts();

  const apiUrl = `http://localhost:${ports.api}`;
  const webUrl = ports.web ? `http://localhost:${ports.web}` : null;
  console.log(`dev: api ${apiUrl}${webUrl ? `, web ${webUrl}` : ''}`);

  const names = ['api'];
  const colors = ['magenta'];
  const commands = [`npm run dev -w ${API_PKG}`];
  if (webUrl) {
    names.unshift('web');
    colors.unshift('cyan');
    commands.unshift(`next dev -p ${ports.web}`);
  }

  child = spawn(
    path.join(ROOT, 'node_modules', '.bin', 'concurrently'),
    ['-k', '-n', names.join(','), '-c', colors.join(','), ...commands],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        ...prepared.env,
        // `node scripts/dev.mjs` без npm: next должен находиться и так.
        PATH: `${path.join(ROOT, 'node_modules', '.bin')}${path.delimiter}${process.env.PATH}`,
        PORT: String(ports.api),
        BACKEND_URL: apiUrl,
        // Better Auth строит адреса колбэков от BETTER_AUTH_URL: веб уехал с :3000,
        // значит и базовый адрес должен уехать вместе с ним.
        ...(webUrl ? { WEB_ORIGIN: webUrl, BETTER_AUTH_URL: webUrl } : {}),
      },
      stdio: 'inherit',
    },
  );
  child.on('exit', (code, signal) => {
    if (busy) return;
    process.exit(code ?? (signal ? 1 : 0));
  });
}

function stop() {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    child.kill('SIGTERM');
  });
}

async function onHeadChange() {
  if (busy || stopping) return;
  const next = currentBranch();
  if (!next || next === branch) return;
  busy = true;
  console.log(`\ndev: ветка ${branch} → ${next}, перезапускаю с её базой`);
  await stop();
  await waitPortsFree();
  try {
    await start();
  } catch (error) {
    console.error(`db: ${error.message}`);
    process.exit(1);
  }
  busy = false;
}

let timer = null;
watch(gitDir(), (_event, file) => {
  if (file !== 'HEAD') return;
  clearTimeout(timer);
  timer = setTimeout(() => void onHeadChange(), 700);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    if (child) child.kill(signal);
    else process.exit(130);
  });
}

try {
  await start();
} catch (error) {
  console.error(`db: ${error.message}`);
  process.exit(1);
}
