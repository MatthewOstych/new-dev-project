# Внешние сервисы через direnv

Образец: `.envrc` в clan-front и accounting.
- Токен лежит вне репозитория, в `~/.config/<сервис>-tokens/<аккаунт>`.
- `.envrc` читает его и экспортирует вместе с ID проектов. Если файла нет, он
  пишет `log_error`, а не падает.
- `.envrc` коммитится: в нём только пути и идентификаторы.

Шаблон: `templates/root/.envrc.tpl`. Блоки невыбранных сервисов удаляются.

## Доступы на старте (фаза 0.5 в SKILL.md)

Все доступы запрашиваются сразу, одним списком, до кода. Они бывают двух видов:

- **через direnv**: секрет лежит файлом в `~/.config/…`, `.envrc` его
  экспортирует, проверка идёт командой CLI с этим окружением;
- **через консоль**: доступ уже есть у владельца (логин CLI, аккаунт в Xcode)
  или требует действия в веб-консоли сервиса. Проверяем командой в терминале,
  а где команды нет, спрашиваем владельца «сделано?».

Секреты в чат не присылаются никогда. ID и имена аккаунтов можно.

| Сервис | Что нужно | Как даётся | Как проверяем (только чтение) |
|---|---|---|---|
| GitHub | доступ аккаунта к репозиторию | консоль: `gh` залогинен под нужным аккаунтом или SSH-ключ | `gh auth status` (нет `gh`: записать и пропустить), `git ls-remote origin` |
| Railway | account token; project, environment и service ID (если проект уже есть) | direnv: `~/.config/railway-tokens/<acc>`; ID в чат | `railway whoami`, `railway status` |
| Vercel | token; org ID и project ID (если проект уже есть) | direnv: `~/.config/vercel-tokens/<acc>`; ID в чат | `vercel whoami` |
| Stripe (CLI) | авторизация CLI отдельным профилем под аккаунт проекта; ключ не запрашивается | консоль: владелец сам запускает в своём терминале `stripe login --project-name=<acc>` и подтверждает в браузере; `.envrc` только выбирает профиль (`STRIPE_PROJECT_NAME`) | `direnv exec . stripe products list --limit 1` |
| Stripe (бэк) | ключ самого проекта: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (test mode) | владелец вписывает сам в `backend/services/api/.env` | ключ непустой (`grep -c '^STRIPE_SECRET_KEY=.\+' .env`), значение не читать |
| Apple (CLI) | ключ App Store Connect API (.p8), Key ID, Issuer ID, Team ID | direnv: `~/.config/apple-keys/<acc>/AuthKey_<KEYID>.p8`; ID в чат | `xcrun notarytool history --key … --key-id … --issuer …` |
| Apple (подпись) | аккаунт команды в Xcode | консоль: Xcode → Settings → Accounts | `security find-identity -v -p codesigning \| grep '(<TEAM_ID>)'`; Team ID неизвестен: статус «частично» |
| Sign in with Apple | App ID с capability, Services ID (для веба), ключ Sign in with Apple (.p8) + Key ID | веб-консоль Apple Developer. Railway: ключ владелец вписывает в `.env` API. Firebase: ключ и Services ID вводятся в консоли Firebase (Authentication → Apple) | «сделано?» у владельца (+ у Railway ключ непустой в `.env`) |
| Google Sign-In | OAuth client ID: Web (+ secret), iOS, Android (SHA-1 debug-ключа) | веб-консоль Google Cloud; ID в чат. Railway: secret владелец вписывает в `.env` API. Firebase: провайдер Google включается в консоли Firebase | «сделано?» + `keytool -list -v -keystore ~/.android/debug.keystore` даёт SHA-1 для Android client |
| PostHog | personal API key (read); project key (`phc_…`), host, project ID | direnv: `~/.config/posthog-tokens/<acc>`; project key, host, ID в чат (они публичные) | `curl` на `/api/users/@me/` → 200 |
| Firebase (CLI и Admin) | service account JSON; project ID | direnv: `~/.config/firebase-tokens/<acc>.json`; ID в чат | `firebase projects:list` |
| Firebase (клиенты) | `GoogleService-Info.plist`, `google-services.json`, web config | веб-консоль Firebase → настройки проекта; файлы владелец кладёт в папки приложений | файлы на месте, `BUNDLE_ID` и `project_id` в них совпадают с ответами |
| Firebase (вход) | провайдеры email, Apple, Google включены | веб-консоль Firebase → Authentication | «сделано?» у владельца |
| Локальные инструменты | Postgres из brew (Railway), Xcode, Android SDK, xcodegen, swiftlint, gradle; свободное место не меньше 20 ГБ | консоль | `brew list --formula \| grep postgresql`, `pg_isready -h localhost`, `xcodebuild -version`, `ls ~/Library/Android/sdk`, `command -v …`, `df -h ~` |

Строки невыбранных сервисов не показываются. Команды для файлов с токенами
даются готовыми, пример:
`mkdir -p ~/.config/railway-tokens && pbpaste > ~/.config/railway-tokens/<acc> && chmod 600 ~/.config/railway-tokens/<acc>`.
Для Stripe вместо файла готовая команда входа: `stripe login --project-name=<acc>`.

## Порядок для каждого выбранного сервиса

Фаза 0.5 (список доступов владельцу):
1. Из таблицы «Доступы на старте» показать только строки выбранных сервисов,
   с готовыми командами для файлов-токенов.

Фаза 1 (после `git init`):
2. **Файл токена есть?** Проверять только непустоту:
   `test -s ~/.config/<сервис>-tokens/<аккаунт>`. Содержимое не читать и не
   печатать. У Stripe файла нет: профиль проверяется проверкой на чтение из
   п. 5. Если профиля нет, CLI так и пишет, и владелец запускает
   `stripe login --project-name=<acc>` в своём терминале (агент login не
   запускает).
3. **Блок `.envrc`.** Вписать ID, которые назвал владелец. Неизвестные ID
   оставить пустыми строками и занести в «что сделать руками». Блок пишется,
   даже если файла токена пока нет.
4. **`direnv allow`** запускает владелец. После этого direnv-проверки идут через
   `direnv exec . <команда>`. Без allow проверка откладывается в init-задачу.
5. **Проверка только на чтение** (колонка «как проверяем»). Вывод команд не
   пересказывать, если в нём значения ключей. Результат: «ок» или «не ок +
   причина».

Фаза 3 (код):
6. **Заготовка в коде** (таблица ниже). Это полупустая папка:
   - `AGENTS.md` (+ `CLAUDE.md`) с правилами интеграции;
   - ключи в `.env.example` и в `env.ts` как `optional()` с комментарием,
     что с первым кодом ключ становится обязательным;
   - **зависимость установлена сразу**;
   - ни клиента, ни функций.

## Сервисы

| Сервис | Файл токена | Экспорт в `.envrc` | Проверка на чтение | Заготовка |
|---|---|---|---|---|
| Railway | `~/.config/railway-tokens/<acc>` (account token) | `RAILWAY_API_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_SERVICE_ID` | `railway whoami`, `railway status` | `backend/services/api/railway.json` (ниже) |
| Vercel | `~/.config/vercel-tokens/<acc>` | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | `vercel whoami` | нет, Next деплоится как есть |
| Stripe | нет: профиль `stripe login --project-name=<acc>`, ключи в `~/.config/stripe/config.toml` | `STRIPE_PROJECT_NAME` (выбирает профиль CLI, бэк не читает) | `stripe products list --limit 1` | бэк `modules/billing/`, веб `src/services/billing/` (только если у веба есть `(app)`), `npm i stripe -w @<slug>/api`, `STRIPE_SECRET_KEY` и `STRIPE_WEBHOOK_SECRET` в `.env.example` API |
| Apple | `~/.config/apple-keys/<acc>/AuthKey_<KEYID>.p8` (ключ App Store Connect API) | `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_PATH` | `xcrun notarytool history --key "$ASC_KEY_PATH" --key-id "$ASC_KEY_ID" --issuer "$ASC_ISSUER_ID"` | `DEVELOPMENT_TEAM` в `project.yml`, entitlement Sign in with Apple; в env API `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (ключ Sign in with Apple, отдельный от ASC) |
| PostHog | `~/.config/posthog-tokens/<acc>` (personal API key, scope read) | `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_HOST`, `POSTHOG_PROJECT_ID` | `curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $POSTHOG_PERSONAL_API_KEY" "$POSTHOG_HOST/api/users/@me/"` → 200 | `services/analytics/` на вебе (`npm i posthog-js`), iOS (SPM `posthog-ios`), Android (`com.posthog:posthog-android`); `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` в `.env.example` веба |
| Firebase | `~/.config/firebase-tokens/<acc>.json` (service account) | `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_PROJECT` | `firebase projects:list` | `backend/firebase/` (`backend-firebase.md`) |

**PostHog отложен:** `services/analytics/AGENTS.md` на каждой платформе с одной
мыслью (аналитика будет здесь, через PostHog), без ключей и SDK.

## `railway.json` API

Config as code. Деплой делает владелец. Пример с репозиторием в корне:

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "RAILPACK",
    "buildCommand": "npm ci && npm run build -w @<slug>/db && npm run build -w @<slug>/api"
  },
  "deploy": {
    "startCommand": "node backend/services/api/dist/index.js",
    "healthcheckPath": "/health",
    "numReplicas": 1,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

Про `numReplicas`: миграции идут под advisory lock, поэтому реплики безопасны,
пока не появился `worker/` (правило в `AGENTS.md` бэка). Путь к `railway.json`
указывается в настройках сервиса Railway, это шаг владельца.

## Правила интеграций для их `AGENTS.md`

- **Stripe:**
  - ключи живут только на бэке;
  - вебхук проверяется подписью (`STRIPE_WEBHOOK_SECRET`);
  - «нет строки подписки» значит бесплатный тариф;
  - цифровое в мобилке продаётся только через StoreKit и Play Billing, не через Stripe;
  - CLI работает только на чтение.
- **PostHog:**
  - один модуль-обёртка на платформу, экраны зовут только его;
  - персональные данные в события не пишутся;
  - ключ проекта публичный, personal key только в direnv.
- **Apple:**
  - ключ ASC (.p8) только в `~/.config`;
  - ключ Sign in with Apple только в env бэка;
  - оба никогда не коммитятся.
