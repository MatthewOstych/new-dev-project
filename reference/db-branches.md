# База на ветку и защита от развилки миграций (Railway)

Все файлы берутся из `templates/` с заменой плейсхолдеров. Источники:
- accounting: `branch-db.mjs`, `migrations-fork.mjs`, dev со сменой ветки;
- clan-front: brew-Postgres вместо контейнера, миграции на старте под
  блокировкой, сверка журнала, хук, свободные порты.

**Docker не нужен.** Postgres локально это brew-сервис (`brew services`), общий
для всех проектов машины на `localhost:5432`. Базы проекта отличаются
префиксом slug. Скрипт сервер только поднимает, если тот не отвечает, и
никогда не останавливает.

## Файлы

Скрипты `scripts/*.mjs` копируются в фазе 2: `db:generate` и `db:migrate`
нужны уже в фазе 4. Фаза 8 подключает хук и проверяет всё вместе.

| Куда | Шаблон | Что делает |
|---|---|---|
| `scripts/branch-db.mjs` | `templates/scripts/branch-db.mjs` | база на ветку: основная ветка → `<db>`, прочие → `<db>__<ветка>` копией основной (`pg_dump` во временный файл → `pg_restore`); лечит разошедшийся журнал; блокировка; `up/migrate/run/reset/list/prune`; отказывается работать не с localhost |
| `scripts/migrations-fork.mjs` | `templates/scripts/migrations-fork.mjs` | журнал ветки против всех локальных веток и `origin/*`: чужая миграция, коллизия номера, своя старше чужой |
| `scripts/dev.mjs` | `templates/scripts/dev.mjs` | готовит базу ветки, свободные порты, веб + API обычными процессами; при checkout перезапускает их с базой новой ветки |
| `backend/packages/db/src/migrate.ts` | `templates/backend/db/migrate.ts` | миграции на старте API под advisory lock |
| `backend/packages/db/src/migrationDrift.ts` | `templates/backend/db/migrationDrift.ts` | после миграций пишет в лог пропущенные и лишние миграции |
| `.claude/hooks/schema-reminder.mjs` + `.claude/settings.json` | `templates/claude/` | правка схемы → напоминание `/schema-change` + проверка развилки |
| `.claude/skills/schema-change/` | `templates/claude/skills/schema-change/` | порядок: развилка → схема → generate → прочитать SQL → migrate → db-scheme |

## Плейсхолдеры

| Плейсхолдер | Значение |
|---|---|
| `{{DB_NAME}}` | slug через подчёркивания (`acme`, `my_app`); проверить, что на сервере нет чужой базы с этим именем |
| `{{MAIN_BRANCH}}` | основная ветка из ответов (`main`) |
| `{{DB_DIR}}` | `backend/packages/db` |
| `{{DB_DIR_REGEX}}` | `backend\/packages\/db` |
| `{{DB_PKG}}` | `@<slug>/db` |
| `{{API_DIR}}` | `backend/services/api` |
| `{{API_PKG}}` | `@<slug>/api` |
| `{{API_PORT}}` | порт API проекта, см. `placeholders.md` |
| `{{MIGRATION_LOCK_KEY}}` | случайное целое от 1 до 2 147 483 647 (int4, например `1_084_069_707`), фиксируется навсегда |

## Подключение

- **Postgres.**
  - Есть формула `postgresql@NN` и `pg_isready -h localhost` отвечает:
    ничего не делать.
  - Формулы нет: `brew install postgresql@17 && brew services start postgresql@17`
    (сказать владельцу, что ставится).
  - Клиенты скрипт берёт из той же формулы, что и сервер.
- `backend/packages/db/package.json`: `"pregenerate": "node ../../../scripts/migrations-fork.mjs --fetch"`.
  `db:generate` не запустится при развилке.
- Корневые скрипты `db:*` и `dev*` из `layout.md`, `concurrently` в
  devDependencies корня.
- **`DATABASE_URL`.**
  - `.env.example` API и пакета db: `DATABASE_URL=postgres://localhost:5432/<db>`
    с комментарием «пользователь по умолчанию системный (brew), пароля нет».
  - Локальные `.env` копией `.env.example` с явным пользователем:
    `postgres://$(whoami)@localhost:5432/<db>`.
  - Секреты генерируются: `BETTER_AUTH_SECRET` через `openssl rand -base64 32`.
- API на старте зовёт `runMigrations` и `describeDrift` (`backend-railway.md`).

## Проверка фазы

1. `npm run db:up`: Postgres отвечает.
2. `npm run db:migrate`: база основной ветки создана пустой, миграции
   применились.
3. `git checkout -b check/branch-db && npm run db:migrate`: создана
   `<db>__check_branch_db` копией.
4. `npm run db:branches` показывает обе, `npm run db:fork-check` чистый.
5. Вернуться на основную ветку, `git branch -D check/branch-db`,
   `npm run db:prune -- --yes` удаляет осиротевшую базу. В репозитории без
   коммитов (фаза 8 идёт до первого коммита) `git checkout main` падает:
   вернуться через `git symbolic-ref HEAD refs/heads/<основная>`, `branch -D`
   пропустить, а осиротевшую базу удалить `npm run db:prune -- --yes` после
   того, как ветка исчезнет из `db:branches`.
6. В init-задаче отметить фазу.
