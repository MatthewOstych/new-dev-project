# Бэкенд: Firebase

Firebase-бэк лежит отдельной папкой `backend/firebase/`. Аутентификация здесь
Firebase Auth: она родная для платформы и одинаково работает на вебе, iOS и
Android. Better Auth относится к варианту Railway. Письма подтверждения и сброса
пароля шлёт сам Firebase Auth.

## Раскладка

```
backend/firebase/
  AGENTS.md                единственный AGENTS.md бэка (отдельный backend/AGENTS.md не нужен)
  firebase.json            functions, firestore, storage, emulators
  .firebaserc              { "projects": { "default": "demo-<slug>" } } до появления настоящего проекта
  firestore.rules          по умолчанию всё закрыто
  firestore.indexes.json   { "indexes": [], "fieldOverrides": [] }
  storage.rules            по умолчанию всё закрыто
  functions/               workspace @<slug>/functions
    package.json · tsconfig.json · .env.example
    src/
      index.ts             первой строкой импорт ./shared/setup.js, дальше реэкспорт функций фич
      shared/setup.ts      initializeApp() и setGlobalOptions({ region }): один раз на процесс
      shared/env.ts        только если у функций есть переменные
      <фича>/index.ts      функции фичи; внутри handlers/, services/, helpers/ по мере роста
```

На старте фич нет: `index.ts` импортирует `setup` и больше ничего. Пустые
функции-примеры не создаются. `shared/admin.ts` (аксессоры `db()` и `auth()`)
появляется вместе с первой фичей, которой они нужны.

## Правила

- **Импорты сверху вниз:** `index.ts` → фича → `shared/`. Фича не
  импортирует соседнюю фичу ни с какой глубины (линт, блок `[firebase]` в
  eslint). Нужное двоим уходит в `shared/`.
- **Инициализация в `shared/setup.ts`, и `index.ts` импортирует его первым.**
  В ESM реэкспортированные модули фич исполняются раньше тела `index.ts`, а
  firebase-functions читает глобальные опции (регион) в момент объявления
  каждой функции. Поэтому `initializeApp()` и `setGlobalOptions()` не могут
  жить в теле `index.ts`.
- **Admin SDK берут функциями, а не константами:** `db()` и `auth()` в
  `shared/admin.ts`. Константа `getFirestore()` на верхнем уровне модуля
  упадёт с «default app does not exist», если модуль загрузится раньше `setup`.
- `firestore.rules` и `storage.rules` правятся тем же изменением, что код,
  который начинает читать или писать новую коллекцию. Правило по умолчанию
  `allow read, write: if false;`.
- Индексы только через `firestore.indexes.json`, не руками в консоли.
- Функции второго поколения (`firebase-functions/v2`). Исключение: триггер
  удаления пользователя есть только в v1 (`auth.user().onDelete`); второй
  вариант, callable, который клиент зовёт до `user.delete()`. На старте
  данных пользователя нет, поэтому и функции нет.
- Секреты функций через `defineSecret` и Secret Manager, не в `.env`
  репозитория. `.env.example` перечисляет только имена.

## Пакет функций

- `package.json`: `"type": "module"`, `"main": "dist/index.js"`,
  `engines.node` равен `runtime` из `firebase.json`.
- **`runtime` = мажорная версия локального Node** (`node -v`), чтобы
  эмулятор не ругался на расхождение. Хочется новее: сначала `.nvmrc` и
  локальный Node той же версии.
- `tsconfig.json`: `module` и `moduleResolution` NodeNext, `outDir: dist`,
  `rootDir: src`, `strict`.
- Scripts: `build`: `tsc`, `typecheck`: `tsc --noEmit`.
- `firebase-tools` в devDependencies корня, скрипты зовут `firebase` из
  `node_modules/.bin`, а не глобальный CLI.
- Установка: `npm install` в корне, потом
  `npm i firebase-functions firebase-admin -w @<slug>/functions` и проверить,
  что зависимости попали в `package.json` пакета.

## firebase.json (основа)

```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "runtime": "nodejs<мажор локального Node>",
      "predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"]
    }
  ],
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "storage": { "rules": "storage.rules" },
  "emulators": {
    "auth": { "port": 9099 },
    "functions": { "port": 5001 },
    "firestore": { "port": 8080 },
    "storage": { "port": 9199 },
    "ui": { "enabled": true, "port": <свободный порт> }
  }
}
```

- **Порт UI эмуляторов фиксированный и свободный на машине** (проверить
  `lsof -iTCP:<порт> -sTCP:LISTEN`, например 4101), и тот же порт стоит в
  `.claude/launch.json` (`<slug>-firebase`). Порт 4000 по умолчанию часто
  занят API других проектов, и firebase-tools молча уезжает на соседний, а
  превью цепляется к чужому процессу.
- Локально эмуляторы идут на проекте `demo-<slug>` (скрипт `dev:firebase` в
  `layout.md`): префикс `demo-` не требует логина и не трогает облако.
- `firebase init` интерактивный, поэтому файлы пишутся руками. Эмуляторам
  данные на ветку не нужны (решение владельца).

## Клиенты

- Веб (если есть зоны `(app)` или `(admin)`): `src/services/auth/` на Firebase
  Auth (client SDK), сессия для серверных компонентов через session cookie
  Admin SDK, если нужен SSR за логином. Роль admin хранится в custom claims.
  Веб только с `(www)` Firebase SDK не ставит.
- iOS и Android: Firebase SDK через SPM и Gradle (`ios.md`, `android.md`).
  `GoogleService-Info.plist` и `google-services.json` скачивает владелец (шаг в
  init-задаче). Эти файлы не секрет, но привязаны к проекту: коммитятся.
- Удаление аккаунта (требование сторов) через `user.delete()` клиента. Если
  Firebase требует недавний вход, клиент просит войти заново.

## Провайдеры входа

Провайдеры (email, Google, Apple) включаются в консоли Firebase. Это шаг
владельца в «что сделать руками». Для Sign in with Apple ключ и Services ID
вводятся в консоли Firebase (Authentication → Apple), а не в env.

## Проверка фазы

- `npm run build -w @<slug>/functions`, `npm run typecheck`.
- `npm run dev:firebase` поднимает эмуляторы на `demo-<slug>` («All emulators
  ready»).
- REST эмулятора Auth (`http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`
  и `:signInWithPassword`, `:delete`):
  - регистрация и вход работают;
  - неверный пароль даёт `INVALID_PASSWORD`;
  - удаление проходит, вход после него даёт `EMAIL_NOT_FOUND`.
- Firestore с валидным токеном отвечает 403: правила закрыты.
- Остановить ровно те процессы эмуляторов, которые запускал.
- Проверка на чтение `firebase projects:list` только после `direnv allow` и
  при наличии service account.
