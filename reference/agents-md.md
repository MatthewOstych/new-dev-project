# AGENTS.md: корневой и вложенные

Образец: clan-front. Короткое правило живёт в ближайшем к коду `AGENTS.md`,
причина в `Documentation [Name]/`. Рядом с каждым `AGENTS.md` лежит `CLAUDE.md`
из одной строки `@AGENTS.md`: Claude Code читает `AGENTS.md` только через
импорт. Все тексты по-русски, без длинных тире, идентификаторы и пути
по-английски.

**Свой `AGENTS.md` получает:**
- каждая часть (`src/app`, `src/services`, `src/ui`, `backend`, каждый сервис
  бэка, `backend/packages/db`, `ios`, `android`);
- каждая интеграция (`modules/billing`, `services/analytics`);
- позже каждый крупный модуль или большой отдельный компонент со своими
  правилами.

Новый `AGENTS.md` заводится вместе с `CLAUDE.md` и строкой в таблице
корневого.

## Корневой `AGENTS.md`

Шаблон `templates/root/AGENTS.md`, копируется через `apply.mjs`. Плейсхолдеры
`{{NEXT_AGENTS_BLOCK}}`, `{{PRODUCT_SUMMARY}}`, `{{NESTED_AGENTS_TABLE}}`
описаны в `placeholders.md`. Разделы: устройство, правила рядом с кодом и
таблица вложенных `AGENTS.md`, главные правила, скиллы, деплой и сервисы,
разработка, реестр задач.

## Вложенные: суть каждого

Писать коротко, 15–40 строк. Раскладка папки блоком кода, дальше правила
списком. Основа для каждого:

- **`src/app/AGENTS.md`:** зоны и доступ (таблица из `layout.md`); фича как
  папка (`views/ components/ hooks/ helpers/ actions/`); тонкий `page.tsx`;
  компонент только рисует; фича не импортирует фичу; `metadata` у каждой
  страницы; экран от 360px; URL только из `routes.ts`.
- **`src/services/AGENTS.md`:** сервис это папка с бочкой; по умолчанию
  клиентская функция через `services/api`; `*.server.ts` и `'use server'` только
  при секрете; не импортирует `app` и `ui`; базу не видит.
- **`src/ui/AGENTS.md`:** единственный источник примитивов; токены в
  `globals.css`; не знает об экранах и сервисах; снаружи только бочка; новый
  примитив появляется, когда он нужен экрану, а не впрок.
- **`backend/AGENTS.md`:** раскладка `services/` и `packages/`; модуль это
  будущий сервис; раздел «Что нельзя реплицировать» (`worker/` с одной дверью,
  пока его нет, реплики безопасны; миграции под advisory lock); миграции
  генерирует drizzle-kit, SQL руками не правят, развилку ловит
  `pregenerate`; внутренние ошибки не доходят до клиента.
- **`backend/services/api/AGENTS.md`:** слои модуля (routes / service /
  repository / access); `modules/index.ts` как карта префиксов; env только
  через `config/env.ts`; отказ только через `AppError`; аутентификация и
  `requireSession`.
- **`backend/packages/db/AGENTS.md`:** схема по доменам, таблица принадлежит
  одному модулю; `/schema-change`; db-scheme тем же изменением.
- **интеграция (`modules/billing/AGENTS.md` и т. п.):** что это за сервис, где
  ключи (имена, не значения), правила из `services-direnv.md`, статус
  «заготовка: кода нет, SDK установлен».
- **`ios/AGENTS.md` и `android/AGENTS.md`:** раскладка и правила из `ios.md` /
  `android.md`, как собрать и проверить, какие правила держит линт или тест.
- **`backend/firebase/AGENTS.md`:** правила из `backend-firebase.md`. У
  Firebase это единственный `AGENTS.md` бэка, отдельный `backend/AGENTS.md` не
  заводится.
