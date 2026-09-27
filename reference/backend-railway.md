# Бэкенд: Railway (Fastify + Drizzle + Postgres + Better Auth)

Образцы: `clan-front/backend` (слои модуля, миграции на старте, worker) и
`accounting/backend` (пакеты db/api, `modules/index.ts`, `infra/`).

## Раскладка

```
backend/
  AGENTS.md                    общие правила бэка (agents-md.md)
  services/
    api/                       @<slug>/api: на старте единственный сервис
      package.json · tsconfig.json · tsconfig.build.json · .env.example · railway.json
      AGENTS.md
      scripts/dev-session.ts   вход агентом (скилл /dev-login)
      src/
        index.ts               миграции → listen; ничего больше
        app.ts                 buildApp(): плагины, обработчик ошибок, modules/index.ts
        errors.ts              AppError(code, status, message): единственный способ отказать
        config/env.ts          zod; единственное место, где читается process.env
        infra/db.ts            один экземпляр клиента из @<slug>/db
        plugins/               error-handler.ts, cors.ts, rate-limit.ts
        modules/
          index.ts             карта префиксов: какой модуль где висит
          health/              health.routes.ts + index.ts: GET /health
          auth/                auth.ts (betterAuth), auth.routes.ts, auth.access.ts, index.ts
          <интеграция>/        заготовки из services-direnv.md: AGENTS.md, без кода
  packages/
    db/                        @<slug>/db: единственный источник правды о схеме
      package.json · tsconfig.json · drizzle.config.ts · .env.example · AGENTS.md
      src/index.ts             createDb(url), runMigrations, describeDrift, реэкспорт схемы
      src/migrate.ts           templates/backend/db/migrate.ts
      src/migrationDrift.ts    templates/backend/db/migrationDrift.ts
      src/schema/index.ts · src/schema/auth.ts (таблицы Better Auth)
      migrations/              генерирует drizzle-kit, руками не правят
```

## Слои модуля

```
modules/<name>/
  index.ts                дверь: что модуль отдаёт соседям и modules/index.ts
  <name>.routes.ts        HTTP: zod-схемы запроса и ответа, вызов сервиса. Логики нет
  <name>.service.ts       правила. Не знает про request/reply, отказывает через AppError
  <name>.repository.ts    только запросы Drizzle. Правил нет
  <name>.access.ts        заслоны (preHandler), если модулю они нужны
```

На старте в `health` и `auth` только то, что им нужно, пустых service и
repository не создаётся.

Правила (держит линт, `templates/root/eslint.config.mjs`, блок `[railway]`):
- маршрут и сервис не импортируют `drizzle-orm`, `@<slug>/db` и `infra/db`;
  типы берут из `@<slug>/db/schema`;
- **модуль это будущий сервис**: соседи зовут его только через `index.ts`, у
  модуля свои таблицы, в чужие таблицы он не пишет. Вынос модуля на свой
  сервер сводится к переносу папки в `backend/services/<имя>` и замене вызова
  на HTTP;
- всё, что обязано жить в одном экземпляре (cron, потребитель очереди,
  долгоживущий сокет), кладётся только в `src/worker/` с одной дверью
  `worker/index.ts`. Папки нет, пока нет первой такой задачи. Пока её нет,
  API можно реплицировать.

## Пакеты и TypeScript

- Всё ESM (`"type": "module"`), импорты с `.js` на конце, `module` и
  `moduleResolution` = `NodeNext`, `strict`, `verbatimModuleSyntax`.
- `@<slug>/db` в `package.json`:
  ```json
  "exports": {
    ".":        { "types": "./dist/index.d.ts",        "development": "./src/index.ts",        "default": "./dist/index.js" },
    "./schema": { "types": "./dist/schema/index.d.ts", "development": "./src/schema/index.ts", "default": "./dist/schema/index.js" }
  }
  ```
  В dev API запускается `tsx watch --conditions=development`, и пакет базы
  берётся из исходников без сборки. В проде работает `dist`.
- `@<slug>/db` scripts:
  - `build`: `tsc`;
  - `typecheck`: `tsc --noEmit`;
  - `pregenerate`: `node ../../../scripts/migrations-fork.mjs --fetch`;
  - `generate`: `drizzle-kit generate`;
  - `migrate`: `drizzle-kit migrate`;
  - `studio`: `drizzle-kit studio`.

  `drizzle.config.ts` грузит `dotenv/config`. Значение из окружения
  (`branch-db.mjs`) главнее `.env`.
- `@<slug>/api`:
  - `tsconfig.json` для typecheck (`noEmit`, `customConditions: ["development"]`,
    include `src` и `scripts`);
  - `tsconfig.build.json` для сборки (`rootDir: src`, `outDir: dist`, без
    customConditions).

  Scripts:
  - `dev`: `tsx watch --conditions=development --env-file-if-exists=.env src/index.ts`;
  - `build`: `tsc -p tsconfig.build.json`;
  - `typecheck`: `tsc --noEmit`;
  - `start`: `node dist/index.js`;
  - `dev-session`: `tsx --conditions=development --env-file-if-exists=.env scripts/dev-session.ts`.
- Корневой `tsconfig.json` веба исключает `backend`, `mobile`, `ios`, `android`.

## Старт процесса (`src/index.ts`)

Порядок как в `clan-front/backend/src/index.ts`:

1. `runMigrations(env.DATABASE_URL)` до `listen`. Упавшая миграция валит
   процесс с полной ошибкой: рестарт-цикл с причиной лучше молча работающего
   старого кода.
2. `describeDrift(drift)` пишется в лог уровнем `warn` или `error`, старт не
   валит.
3. `app.listen({ port: env.PORT, host: '0.0.0.0' })`.

## env (`config/env.ts`)

zod, парсинг на старте, падение с понятным текстом. Состав:
- `NODE_ENV`, `PORT` (по умолчанию порт API проекта `{{API_PORT}}` из `placeholders.md`), `DATABASE_URL`;
- `WEB_ORIGIN` (выставляет `scripts/dev.mjs`, в проде адрес веба);
- `BETTER_AUTH_SECRET` (min 32), `BETTER_AUTH_URL`: публичный адрес, по
  которому клиенты ходят в `/api/auth`. Есть веб: это адрес веба, потому что
  он проксирует `/api/*`. Нет веба: адрес API;
- ключи провайдеров входа (optional: провайдер включается, только если ключи
  заданы);
- ключи интеграций (optional до первого кода).

`.env.example` перечисляет все ключи без значений. Локальный `DATABASE_URL`:
`postgres://<whoami>@localhost:5432/<db>` (brew-Postgres, пользователь системный, без пароля).

## Версии Drizzle

`drizzle-orm` и `drizzle-kit` последней стабильной версии **линии 0.x** (как в
clan-front и accounting). Скрипты журнала (`migrate.ts`, `migrationDrift.ts`,
`branch-db.mjs`, `migrations-fork.mjs`) рассчитаны на
`migrations/meta/_journal.json`. Если `npm view drizzle-kit version` уже 1.x,
ставить 0.x явно (`npm i drizzle-kit@0 drizzle-orm@0`) и записать в
init-задачу; переход на 1.x означает переписать эти скрипты.

## Better Auth

Установка в `@<slug>/api`: `better-auth`, `@better-auth/drizzle-adapter`, `jose`
(подпись client secret для Apple). **Перед правкой читать доки установленной
версии.** Рабочий код, проверенный полным прогоном (better-auth 1.7.5), лежит в
шаблонах; копировать через `apply.mjs`:

| Шаблон | Куда | Что |
|---|---|---|
| `templates/backend/api/modules/auth/auth.ts` | `src/modules/auth/auth.ts` | `betterAuth()`: адаптер Drizzle, email + пароль, Google и Apple (включаются, только когда в env есть все их ключи), `deleteUser`, плагины `bearer` и `admin` |
| `templates/backend/api/modules/auth/auth.routes.ts` | `src/modules/auth/auth.routes.ts` | обработчик `/api/auth/*` для Fastify |
| `templates/backend/api/config/env.ts` | `src/config/env.ts` | zod-схема env, пустое `KEY=` считается «не задано» |
| `templates/backend/api/scripts/dev-session.ts` | `scripts/dev-session.ts` | вход агентом (`/dev-login`) |

Что вычеркнуть руками по ответам владельца: блок `google` (нет входа через
Google), блок `apple` и `jose` (нет Apple), `admin()` и `adminClient` (нет зоны
`(admin)`), ключи этих провайдеров в `env.ts` и `.env.example`.

Почему код такой (в документацию проекта, заметка «Поток регистрации и входа»):
- **Fastify.** `auth.routes.ts` регистрируется обычным `app.register`, не через
  `fastify-plugin`: он убирает парсеры тела в своей области видимости. Тело
  уходит в Better Auth сырым буфером: колбэк Apple приходит формой
  (`form_post`), а пересобранный `JSON.stringify` его теряет. Кук бывает
  несколько, поэтому они копируются через `getSetCookie()`, а не `forEach`.
- **Apple.** Client secret это JWT, подписанный ключом Sign in with Apple
  (.p8), живёт не дольше полугода, поэтому собирается при старте. Для нативного
  входа нужен `appBundleIdentifier` (env `APPLE_APP_BUNDLE_IDENTIFIER`), в
  `trustedOrigins` добавлен `https://appleid.apple.com`. Вход через Apple на
  вебе не работает на `http://localhost`: это проверяется только на https-домене.
- **Google.** Мобилки входят по `idToken`, и Better Auth сверяет его аудиторию со
  списком `clientId: [web, iOS, Android]`. Отсюда env `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`.
- **Удаление аккаунта.** Без пароля Better Auth пускает удалять только свежую
  сессию (`freshAge`, сутки). Пользователь только с Google или Apple и старой
  сессией удаляет аккаунт через письмо (`sendDeleteAccountVerification`). Если
  почта отложена, это дыра под App Store 5.1.1(v): записать в init-задачу.
- **Защищённые маршруты.** `auth.access.ts`: `requireSession` как preHandler
  (`auth.api.getSession({ headers: fromNodeHeaders(request.headers) })`, нет
  сессии → `AppError` 401), `requireAdmin` поверх. Доменных защищённых
  эндпоинтов на старте нет.
- **Запросы с кукой** (выход, удаление) Better Auth принимает только с
  заголовком `Origin` из `trustedOrigins`, иначе 403 `MISSING_OR_NULL_ORIGIN`.

### Таблицы Better Auth

Схему Drizzle генерирует CLI (пакет `auth`, прежний `@better-auth/cli` устарел).
Его загрузчик импортирует `auth.ts` целиком и не знает условия `development`,
поэтому порядок такой:

```bash
npm run build -w @<slug>/db
set -a; . backend/services/api/.env; set +a
npx auth@latest generate --config backend/services/api/src/modules/auth/auth.ts \
  --output backend/packages/db/src/schema/auth.ts --yes
npm run db:generate && npm run db:migrate
```

Первый запуск может напечатать безвредное «Drizzle schema mismatch». CLI пишет
`timestamp` без часового пояса: это исключение из соглашения `timestamptz`,
файл сгенерированный, руками не правится (записать в `01. Соглашения схемы`).
Заметка `db-scheme/Auth. Пользователи и сессии`.

## `scripts/dev-session.ts`

Шаблон `templates/backend/api/scripts/dev-session.ts`. Вход агентом без OAuth и
без пароля владельца (скилл `/dev-login`), корневой скрипт `npm run dev-session`
идёт через `branch-db.mjs`:
- отказ, если `DATABASE_URL` не на localhost;
- находит или создаёт пользователя `--email` (`internalAdapter.createUser(user,
  { method: 'admin' })`), создаёт сессию и печатает имя куки, её значение
  (`<token>.<подпись>`, URL-encoded) и bearer-токен;
- `--admin` выдаёт роль admin, `--revoke` снимает все сессии этого пользователя.

Продовый код ради скрипта не меняется.

## Проверка фазы

- `npm run typecheck`, `npm run lint`.
- Через `npm run dev`:
  - `curl -s localhost:<api>/health` отвечает 200;
  - регистрация `POST /api/auth/sign-up/email`;
  - вход `POST /api/auth/sign-in/email` отдаёт куку и `set-auth-token`;
  - выход и удаление с кукой шлются с заголовком `Origin: <адрес веба>`;
  - `GET /api/auth/get-session` с bearer возвращает пользователя;
  - выход.
