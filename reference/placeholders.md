# Плейсхолдеры в templates/

Шаблоны копируются скриптом `templates/apply.mjs` (маркеры частей и
плейсхолдеры): `node <skill>/templates/apply.mjs <values.json> <шаблон> <файл>`.
`values.json` лежит во временной папке, не в репозитории: `{"__parts": [...],
"PROJECT": "...", ...}`.

Формат только `{{UPPER_SNAKE}}`. После копирования шаблона в проекте не должно
остаться ни одного: проверка `grep -rn '{{[A-Z_]*}}' <файлы из шаблонов>` пустая.
Неизвестное значение (ID проекта, Team ID) заменяется пустой строкой и
попадает в «что сделать руками» init-задачи, а не остаётся плейсхолдером.

## Проект

| Плейсхолдер | Значение | Где |
|---|---|---|
| `{{PROJECT}}` | название из ответов (`Orbit`) | docs, скиллы проекта, линт-конфиги, `.envrc` |
| `{{SLUG}}` | slug (`orbit`) | `.claude/launch.json` |
| `{{DOMAIN}}` | домен | init-задача |
| `{{TODAY}}` | сегодняшняя дата `YYYY-MM-DD` | init-задача |
| `{{MAIN_BRANCH}}` | основная ветка из ответов | `branch-db.mjs`, корневой `AGENTS.md`, docs `CLAUDE.md`, `/task-note` |
| `{{PRODUCT_SUMMARY}}` | одна-две фразы: что за продукт и что основа (веб или приложение) | корневой `AGENTS.md` |
| `{{NESTED_AGENTS_TABLE}}` | строки таблицы вложенных `AGENTS.md`: `` | [`путь/AGENTS.md`](путь/AGENTS.md) | о чём | `` | корневой `AGENTS.md` |
| `{{NEXT_AGENTS_BLOCK}}` | блок `<!-- BEGIN:nextjs-agent-rules -->…<!-- END:… -->` из генератора, дословно | корневой `AGENTS.md` |
| `{{API_PORT}}` | порт API проекта: первый свободный начиная с 4100 (`lsof -iTCP:<порт> -sTCP:LISTEN` пуст), фиксируется навсегда; 4000 часто занят другими проектами | `dev.mjs`, `launch.json`, `.env.example` API и веба, Debug-конфиги мобилок |

## Бэкенд Railway и база

| Плейсхолдер | Значение | Где |
|---|---|---|
| `{{DB_NAME}}` | slug через подчёркивания; на сервере не должно быть чужой базы с этим именем | `branch-db.mjs` |
| `{{DB_DIR}}` | `backend/packages/db` | `branch-db.mjs`, `migrations-fork.mjs`, `/schema-change` |
| `{{DB_DIR_REGEX}}` | `backend\/packages\/db` | хук `schema-reminder.mjs` |
| `{{DB_PKG}}` | `@<slug>/db` | `branch-db.mjs`, eslint |
| `{{API_DIR}}` | `backend/services/api` | `branch-db.mjs` |
| `{{API_PKG}}` | `@<slug>/api` | `dev.mjs`, `/dev-login` |
| `{{MIGRATION_LOCK_KEY}}` | случайное целое от 1 до 2 147 483 647 (int4), навсегда | `migrate.ts` |

## Мобилки

| Плейсхолдер | Значение | Где |
|---|---|---|
| `{{APP}}` | имя таргета iOS в PascalCase без пробелов (`Orbit`) | `project.yml`, `.swiftlint.yml`, `/gate` |
| `{{IOS_DIR}}` | `ios` (основа веб) или `mobile/ios` (основа приложение) | `/gate`, `.swiftlint.yml` |
| `{{BUNDLE_ID}}` | bundle id iOS | `project.yml`, init-задача |
| `{{BUNDLE_PREFIX}}` | bundle id без последнего сегмента (`com.example`) | `project.yml` |
| `{{APPLE_TEAM_ID}}` | Team ID или пустая строка | `project.yml`, `.envrc` |
| `{{FIREBASE_IOS_VERSION}}`, `{{GOOGLE_SIGN_IN_VERSION}}`, `{{POSTHOG_IOS_VERSION}}` | последний стабильный релиз с GitHub | `project.yml` |
| `{{ANDROID_DIR}}` | `android` (основа веб) или `mobile/android` (основа приложение) | `/gate`, `detekt.yml` |
| `{{PACKAGE}}` | applicationId Android (он же корневой пакет Kotlin) | `ArchitectureTest.kt`, init-задача |

## Сервисы (`.envrc`)

`{{RAILWAY_ACCOUNT}}`, `{{VERCEL_ACCOUNT}}`, `{{STRIPE_ACCOUNT}}`,
`{{APPLE_ACCOUNT}}`, `{{POSTHOG_ACCOUNT}}`, `{{FIREBASE_ACCOUNT}}` содержат имя
файла токена (аккаунт из ответов). Исключение `{{STRIPE_ACCOUNT}}`: это имя
профиля Stripe CLI (`stripe login --project-name=<acc>`), файла токена нет.

`{{RAILWAY_PROJECT_ID}}`, `{{RAILWAY_ENVIRONMENT_ID}}`, `{{RAILWAY_SERVICE_ID}}`,
`{{VERCEL_ORG_ID}}`, `{{VERCEL_PROJECT_ID}}`, `{{ASC_KEY_ID}}`,
`{{ASC_ISSUER_ID}}`, `{{POSTHOG_HOST}}`, `{{POSTHOG_PROJECT_ID}}`,
`{{FIREBASE_PROJECT_ID}}` это ID, которые владелец назвал в чате, или пустая
строка.

## Документация

| Плейсхолдер | Значение | Где |
|---|---|---|
| `{{PARTS_TABLE}}` | строки таблицы «Часть / Где / Что там / Где живёт» по выбранным частям | `00. Архитектура.md` |
| `{{BASE}}`, `{{PLATFORMS}}`, `{{BACKEND}}`, `{{AUTH}}`, `{{SIGN_IN_METHODS}}`, `{{MAIL}}`, `{{WEB_ZONES}}`, `{{SERVICES}}`, `{{PURCHASES}}`, `{{GIT_REMOTE}}`, `{{GIT_ACCOUNT}}`, `{{BRANCHES}}` | ответы на вопросы фазы 0 словами | init-задача |
| `{{ACCESS_TABLE}}` | строки «доступ / как даётся / проверка / статус» из фазы 1 | init-задача |
| `{{MANUAL_STEPS}}` | чекбоксы «что сделать руками» | init-задача |
