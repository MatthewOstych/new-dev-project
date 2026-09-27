# Раскладка монорепо

## Основа веб

```
<root>/
├─ AGENTS.md · CLAUDE.md          общие правила (CLAUDE.md = строка @AGENTS.md)
├─ Documentation [<Name>]/        vault Obsidian
├─ src/                           веб, Next.js (package.json веба в корне)
├─ backend/                       Railway: services/ + packages/   |   Firebase: firebase/
├─ ios/                           если выбран iOS
├─ android/                       если выбран Android
├─ scripts/                       dev.mjs, branch-db.mjs, migrations-fork.mjs, check-file-size.mjs
├─ .claude/                       settings.json, launch.json, hooks/, skills/
├─ .envrc · .gitignore · .gitattributes · .prettierrc · .prettierignore · eslint.config.mjs
```

## Основа приложение

```
<root>/
├─ AGENTS.md · CLAUDE.md · Documentation [<Name>]/
├─ mobile/                        папка под приложение
│  ├─ ios/                        если выбран iOS
│  └─ android/                    если выбран Android
├─ backend/                       Railway: services/ + packages/   |   Firebase: firebase/
├─ src/                           веб, только если нужен (лендинг, админка)
├─ scripts/ · .claude/ · корневые конфиги как выше
```

**Корневой папки `app/` быть не может:** Next, увидев её, игнорирует
`src/app`, и сайт остаётся без страниц, а сборка при этом проходит. Поэтому
папка под приложение называется `mobile/`.

Когда основа приложение, корневой `package.json` всё равно есть: он держит npm
workspaces бэкенда, скрипты и eslint. Если веба нет, в нём нет Next.

## Веб всегда в `src/app/`

| Зона | Что | Доступ |
|---|---|---|
| `(www)/` | лендинг и публичные страницы (privacy, terms) | все |
| `(app)/(auth)/` | вход, регистрация, сброс пароля | гости |
| `(app)/(account)/` | само приложение, страницы под `/account/…` | `requireSession()` в layout |
| `(admin)/` | админка, страницы под `/admin/…` | роль `admin` в layout (плагин admin у Better Auth, custom claim у Firebase) |

Зоны, которые владелец не выбрал, не создаются. Корень `/` принадлежит только
`(www)`: страницы остальных зон лежат в папках `account/` и `admin/` внутри
групп, иначе Next видит несколько страниц на `/`. Если выбраны поддомены,
`src/proxy.ts` разводит зоны по хостам по картам из `src/routes.ts`, как в
accounting.

## Workspaces (Railway)

Корневой `package.json`:

```json
{
  "private": true,
  "workspaces": ["backend/services/*", "backend/packages/*"],
  "scripts": {
    "dev": "node scripts/dev.mjs",
    "dev:web": "node scripts/branch-db.mjs run -- next dev",
    "dev:api": "node scripts/branch-db.mjs run -- npm run dev -w @<slug>/api",
    "build": "npm run build -w @<slug>/db && npm run build -w @<slug>/api && next build",
    "typecheck": "next typegen && tsc --noEmit && npm run typecheck -w @<slug>/db && npm run typecheck -w @<slug>/api",
    "lint": "eslint",
    "format": "prettier --write .",
    "db:up": "node scripts/branch-db.mjs up",
    "db:generate": "npm run generate -w @<slug>/db",
    "db:migrate": "node scripts/branch-db.mjs migrate",
    "db:studio": "node scripts/branch-db.mjs run -- npm run studio -w @<slug>/db",
    "db:reset": "node scripts/branch-db.mjs reset",
    "db:branches": "node scripts/branch-db.mjs list",
    "db:prune": "node scripts/branch-db.mjs prune",
    "db:fork-check": "node scripts/migrations-fork.mjs --fetch",
    "dev-session": "node scripts/branch-db.mjs run -- npm run dev-session -w @<slug>/api --"
  }
}
```

- `dev-session` идёт через `branch-db.mjs`, иначе на ветке сессия уедет в базу
  основной ветки.
- `dev:web` и `dev:api` по отдельности не знают друг о друге, поэтому значения
  по умолчанию лежат в env: `.env.local` веба `BACKEND_URL=http://localhost:<API_PORT>`,
  `.env` API `WEB_ORIGIN=http://localhost:3000` и `PORT=<API_PORT>`.
  `npm run dev` перебивает их фактическими портами.

Если веба нет, из `dev:web`, `build` и `typecheck` убирается Next (`next
typegen` тоже), а `dev` запускает только API.

## Workspaces (Firebase)

```json
{
  "private": true,
  "workspaces": ["backend/firebase/functions"],
  "scripts": {
    "dev": "next dev",
    "dev:firebase": "npm run build -w @<slug>/functions && firebase emulators:start --config backend/firebase/firebase.json --project demo-<slug> --only auth,firestore,functions",
    "build": "npm run build -w @<slug>/functions && next build",
    "typecheck": "next typegen && tsc --noEmit && npm run typecheck -w @<slug>/functions",
    "lint": "eslint",
    "format": "prettier --write ."
  }
}
```

`firebase-tools` лежит в devDependencies корня, поэтому `firebase` в скриптах
берётся из `node_modules/.bin`, а не глобальный. Эмуляторы идут на проекте
`demo-<slug>`: префикс `demo-` не требует логина и не трогает облако. С настоящим проектом (`FIREBASE_PROJECT` из direnv) их
запускают, когда он появится. Скриптов базы, `dev.mjs` и `branch-db.mjs` в
варианте Firebase нет. Если веба нет, `dev` и Next убираются.

## `.claude/launch.json` по вариантам

`templates/claude/launch.json` написан под Railway с вебом. Оставить только
то, что есть:

| Вариант | Конфигурации |
|---|---|
| Railway + веб | `<slug>` (`npm run dev`), `<slug>-web` (`dev:web`), `<slug>-api` (`dev:api`, порт `<API_PORT>`) |
| Railway без веба | `<slug>-api` (`npm run dev`, порт `<API_PORT>`) |
| Firebase + веб | `<slug>-web` (`npm run dev`, autoPort), `<slug>-firebase` (`dev:firebase`, порт UI эмуляторов из `firebase.json`) |
| Firebase без веба | `<slug>-firebase` |

Хук `schema-reminder` и скилл `/schema-change` есть только у Railway: у
Firebase `.claude/settings.json` без хука (или без файла), `/dev-login` тоже
только у Railway.

## Покупки в будущем (если владелец сказал «да»)

На старте покупок нет, только места под них:

| Где | Что |
|---|---|
| iOS | `services/purchases/PurchasesService.swift`: `final class PurchasesService {}` + `AGENTS.md` (StoreKit 2, цифровое только через App Store) |
| Android | `services/purchases/PurchasesService.kt`: `class PurchasesService` + `AGENTS.md` (Google Play Billing) |
| Веб + бэк | если выбран Stripe: заготовка `billing/` из `services-direnv.md`; иначе `src/services/billing/AGENTS.md` без кода |

Зависимости для покупок на старте не ставятся (StoreKit встроен в iOS, Play
Billing добавляется вместе с первым кодом).
