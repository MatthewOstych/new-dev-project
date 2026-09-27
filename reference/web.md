# Веб: Next.js

Образцы: `clan-front/src` (фича как папка, сервисы с одной дверью, линт-границы)
и `accounting/src` (зоны `(www)`/`(app)`, `routes.ts`, `proxy.ts`).

## Создание: в фазе 2, до корневых файлов

Генератор пишет свои `package.json`, `.gitignore`, `eslint.config.mjs`,
`AGENTS.md`, `README.md`, поэтому веб генерируется **первым шагом фазы 2**, а
шаблоны скилла накладываются поверх. Фаза 5 потом только раскладывает `src/`.

1. Корень уже не пуст (Documentation, init-задача), поэтому генерировать во
   временную папку внутри scratchpad, **без установки**:
   `npx create-next-app@latest <tmp>/<slug> --ts --tailwind --eslint --app
   --src-dir --import-alias "@/*" --use-npm --no-react-compiler --agents-md
   --empty --skip-install --disable-git` (проверено на create-next-app 16.3.5).
   Флаги сверить с `npx create-next-app@latest --help`: генератор не должен
   ничего спрашивать, а `--yes` вместо флагов берёт сохранённые на машине
   предпочтения (так приезжают React Compiler, Biome, Rspack). После генерации
   проверить: в `next.config.ts` нет `reactCompiler`, нет `biome.json`, линтер
   eslint. `--empty` убирает демо-разметку.
2. Перенести в корень: `package.json`, `tsconfig.json`, `next.config.ts`,
   `postcss.config.mjs`, `src/`, `AGENTS.md` (для блока правил). Не переносить
   `.git`, `README.md`, `public/` с демо-SVG. Временную папку удалить сразу.
   `npm install` один раз в корне, когда уже написаны `package.json` всех
   workspaces: вторая копия `node_modules` не нужна.
3. Слить с шаблонами скилла:
   - `.gitignore`: `templates/root/.gitignore` покрывает всё, что было у
     генератора; брать шаблон;
   - `eslint.config.mjs`: целиком из `templates/root/`;
   - `AGENTS.md`: блок `<!-- BEGIN:nextjs-agent-rules -->…<!-- END:… -->` из
     генератора переносится **дословно** в начало корневого `AGENTS.md`,
     `CLAUDE.md` генератора заменяется строкой `@AGENTS.md`. Блок пишет и
     восстанавливает сам `next dev`, поэтому его не правят и не удаляют, и
     правило про длинные тире на него не распространяется;
   - `README.md` пишется свой, короткий: что за проект, `npm run dev`, где
     `AGENTS.md` и `Documentation [Name]`.
4. **Версии генератора всегда главнее «@latest».** Пакеты, которые поставил
   генератор (`eslint`, `typescript`, `tailwindcss`, `@types/*`), вручную не
   поднимать, даже если npm называет их устаревшими. TypeScript во всём
   репозитории один, тот, что поставил генератор; бэкенд берёт его же. Скрипт
   `start` генератора остаётся.
5. Если демо осталось (без `--empty`): убрать разметку в `page.tsx` и
   стили-примеры в `globals.css`, токены оставить. `src/app/favicon.ico`
   **не удалять** (или заменить на `src/app/icon.svg`): без иконки каждая
   страница пишет 404 в консоль. Пустую `public/` удалить.
6. `tsconfig.json`: `exclude` += `backend`, `mobile`, `ios`, `android`. Скрипт
   `typecheck` начинается с `next typegen`: `next-env.d.ts` в `.gitignore` и на
   свежем клоне его нет.
7. `.prettierrc` и `.prettierignore` из шаблона, `prettier` в devDependencies.
   После переноса файлов генератора и после каждой порции нового кода
   `npx eslint --fix .`: `import/order` ставит `type`-импорты последними, и
   почти каждый новый файл он поправит.
8. `next.config.ts` (Railway) из `templates/web/next.config.ts`: `rewrites`
   `/api/:path*` → `${BACKEND_URL}/api/:path*`. Куки Better Auth остаются
   first-party на домене веба, CORS не нужен. Rewrites вшиваются при сборке:
   на Vercel `BACKEND_URL` нужен как переменная сборки, а не только рантайма.
9. **Дисковый кэш Turbopack в dev выключен всегда**: при любом бэкенде и в
   проекте «только лендинг». В `next.config.ts` стоит
   `experimental: { turbopackFileSystemCacheForDev: false }`. В шаблоне он уже
   есть; если `next.config.ts` остался от генератора, дописать туда. По
   умолчанию кэш включён и не чистится: в одном проекте за полтора месяца он
   дорос до 19 ГБ в `.next/dev/cache/turbopack`. Цена отключения: после
   перезапуска `next dev` первая компиляция медленнее. При старте Next
   помечает флаг как экспериментальный, это не ошибка. Имя опции сверить с
   `node_modules/next/dist/server/config-shared.js`: если в новой версии его
   переименовали, выключить под новым именем, а не пропустить.

## Раскладка

```
src/
  app/
    layout.tsx · globals.css · not-found.tsx
    (www)/                     лендинг: page.tsx-оболочка, legal при необходимости
    (app)/(auth)/login/ · register/        настоящие экраны входа и регистрации
    (app)/(account)/layout.tsx             requireSession()
    (app)/(account)/account/page.tsx       /account: оболочка, настройки аккаунта (выход, удаление)
    (admin)/layout.tsx                     requireAdmin()
    (admin)/admin/page.tsx                 /admin: оболочка
  services/
    api/                       HTTP-клиент к бэку: появляется с первым доменным запросом (вход идёт через клиент Better Auth)
    auth/                      клиент Better Auth (useSession, signIn, signUp, signOut, deleteUser) + session.server.ts
    analytics/ · billing/      заготовки интеграций (services-direnv.md)
  ui/                          библиотека UI: index.ts-бочка, токены, примитивы
  routes.ts                    все URL по зонам: строковых путей в коде нет
  proxy.ts                     оптимистичный гард зон (кука сессии), хосты при поддоменах
```

### Особенности Next 16

- Страницы зон не могут все лежать в корне группы: `(www)/page.tsx`,
  `(app)/(account)/page.tsx` и `(admin)/page.tsx` все дают `/`, и Next
  отказывает («parallel pages»). Поэтому `/account` и `/admin` это папки внутри
  групп.
- Layout внутри группы типизируется как `LayoutProps<'/'>`.
- `next typegen` пишет типы в `.next/types`; `typecheck` начинается с него.

### Фича как папка

```
src/app/<зона>/<фича>/
  page.tsx       серверный и тонкий: параметры, сессия, отрисовать view. Разметки нет
  views/         экран целиком, собранный из компонентов
  components/    компоненты ТОЛЬКО этой фичи
  hooks/         состояние и эффекты ("use client")
  helpers/       чистые функции фичи: маппинг, форматирование
  actions/       'use server', только когда нужен секрет или серверные данные
```

- Компонент только рисует. Состояние и эффекты уходят в `hooks/`,
  преобразования в `helpers/`, сеть в `src/services/`.
- Понадобилось второй фиче: вид уходит в `src/ui/`, логика в `src/services/`.
  Фича фичу не импортирует (линт).
- Вложенная фича (вкладка экрана) повторяет ту же раскладку внутри себя.
- Новая страница сразу с `metadata`. Экран работает от 360px, без
  горизонтального скролла.
- Папки создаются, когда в них появляется первый файл. Пустые `hooks/` и
  `helpers/` не заводятся.

### Только лендинг (`(www)` без `(app)` и `(admin)`)

- Разделы про аутентификацию, `services/api`, `services/auth` и `proxy.ts` не
  применяются: нет зон за логином, нет и этих файлов.
- Заготовка `billing/` на вебе не делается: платить негде. Интеграции,
  которые лендингу нужны (аналитика), остаются.
- Проверка фазы: `/` отвечает 200, неизвестный путь 404, `metadata` на месте.

### env веба

- Один файл `src/env.ts`: zod-схема (`npm i zod`), парсинг на старте, только
  переменные `NEXT_PUBLIC_*` и серверные ключи веба. Создаётся, когда в
  `.env.example` веба есть хотя бы одна переменная.
- `process.env` в остальном коде веба не читается.

### Слой сервисов

- `src/services/<сервис>/index.ts`: бочка, безопасна для клиента. Снаружи
  импортируют только её или `*.server.ts` по пути (линт).
- **По умолчанию запрос это обычная клиентская функция** через
  `services/api` (или hook поверх неё).
- `'use server'` или `*.server.ts` (с `import 'server-only'`) только когда есть
  секрет, чувствительные данные или нужен SSR. `*.server.ts` не
  реэкспортируется из бочки.
- Сервис не знает об экранах и UI (линт). Базу веб не видит вовсе: данные
  только через API бэка.

### Аутентификация (Railway, Better Auth)

- `services/auth/client.ts`: `createAuthClient` из `better-auth/react` с
  `baseURL` на свой origin (запросы идут на `/api/auth/*`, rewrite уводит их в
  API). Плагин `adminClient`, если есть `(admin)`.
- `services/auth/session.server.ts`: `getSession()` ходит в
  `${BACKEND_URL}/api/auth/get-session` с куками запроса; `requireSession()`
  и `requireAdmin()` делают redirect на `routes.login`.
- `proxy.ts` из `templates/web/proxy.ts`: только оптимистичная проверка куки
  сессии (`getSessionCookie`), редирект гостя из `/account` и `/admin` на вход.
  Настоящая проверка в layout и на бэке. `matcher` обязан быть литералом (Next
  разбирает его статически), поэтому пути зон повторены в нём, а не взяты из
  `routes.ts`; без зоны `(admin)` строку `/admin/:path*` убрать. Proxy в
  Next 16 всегда работает на Node.
- Экраны `(auth)`: вход, регистрация, выход, удаление аккаунта (в настройках
  `(account)`), кнопки Google и Apple, если провайдеры выбраны. Раскладка по
  правилам фичи: view + components + hook формы.

### Библиотека UI (`src/ui/`)

- Единственный источник примитивов: `Button`, `Input`, `FormField`, `Panel`,
  хелпер классов `cx`. На старте только то, что нужно экранам входа.
- Токены (цвета, радиусы, отступы, шрифты) в `globals.css` через `@theme`
  Tailwind v4. Отдельного `tailwind.config` нет.
- Линт: голые `button/input/select/textarea/dialog` вне `src/ui` запрещены,
  `src/ui` не импортирует `app` и `services`, снаружи только бочка `@/ui`.

## Линт веба

`templates/root/eslint.config.mjs`, блок `[web]`:
- двери сервисов и UI;
- фича не импортирует фичу;
- сервисы не знают экранов;
- изоляция `ui`;
- `*.server` запрещён в `components/` и `hooks/`;
- `react/forbid-elements`;
- `import/order`;
- `max-lines` 500.

Правила линта не отключают, чтобы «быстро проверить».

## Проверка фазы

- `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- Превью (`.claude/launch.json`):
  - `/` отдаёт лендинг;
  - гость из `(account)` уходит на `/login`;
  - регистрация и вход работают;
  - после входа открывается `(account)`.
- После запуска `next dev` папки `.next/dev/cache/turbopack` нет (пункт 9
  «Создания»).
