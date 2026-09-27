import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// Границы архитектуры держит этот файл, причины каждой границы лежат в
// Documentation [{{PROJECT}}] (заметка «Слои и правила»). Правила нарочно без
// резолвера: они смотрят на текст импорта (`@/…`, относительный путь) и потому
// предсказуемы и быстры. Плата одна: относительный импорт через `../` границу
// веба не ловит, поэтому через границу импортируют по алиасу.
//
// `no-restricted-imports` НЕ складывается между конфигами: последний объект,
// подошедший файлу, побеждает целиком. Поэтому наборы собираются здесь, и каждый
// объект ниже несёт ПОЛНЫЙ набор для своих файлов.
//
// Секции частей проекта (веб, бэкенд Railway, функции Firebase) оставлены только
// для тех частей, которые в проекте есть.

// --- [web] Веб: двери и изоляция -----------------------------------------------

// Одна дверь у каждого сервиса: бочка `@/services/<сервис>` либо явный
// `*.server` по пути. Файлы внутри сервиса снаружи не берут, иначе граница
// сервиса перестаёт быть границей.
const SERVICE_DOORS = {
  group: ['@/services/*/**', '!@/services/*/*.server'],
  message: 'У сервиса одна дверь: бочка `@/services/<сервис>` или его `*.server` по пути.',
};

// Библиотека UI снаружи видна только бочкой: внутренние файлы переезжают, а
// бочка остаётся.
const UI_DOOR = {
  group: ['@/ui/**'],
  message: 'Библиотеку UI импортируют только через бочку `@/ui`.',
};

// Фича не знает о другой фиче. Нужное двоим уходит в `@/ui` (если это вид) или
// в `@/services` (если это логика и данные).
const NO_CROSS_FEATURE = {
  group: ['@/app/**'],
  message: 'Фича не импортирует другую фичу: общее уходит в `@/ui` или `@/services`.',
};

// Сервисы не знают об экранах и о виде: стрелка идёт из app в services.
const NO_SCREENS = {
  group: ['@/app/**', '@/ui', '@/ui/**'],
  message: 'Сервис не знает об экранах и UI: зависимость идёт из app в services, не обратно.',
};

// Библиотека UI не знает ни экранов, ни сервисов, ни сети: данные приходят пропсами.
const UI_ISOLATION = {
  group: ['@/app/**', '@/services', '@/services/**', '**/*.server'],
  message: 'Библиотека UI не знает об экранах и сервисах: данные приходят пропсами.',
};

// Клиентские папки фичи по конвенции: директиву "use client" линт не видит, а
// серверный модуль, затянутый в компонент, падает уже в браузере.
const NO_SERVER_IN_CLIENT = {
  group: ['**/*.server', 'server-only'],
  message: 'components/ и hooks/ клиентские: серверный модуль читает page.tsx или Server Action.',
};

// Примитивы только из библиотеки: голый <button> в экране значит, что у
// проекта появилась вторая кнопка, и копии разойдутся молча.
const FORBID_RAW_ELEMENTS = {
  'react/forbid-elements': [
    'error',
    {
      forbid: ['button', 'input', 'select', 'textarea', 'dialog'].map((element) => ({
        element,
        message: `<${element}> живёт только в библиотеке UI: возьми компонент из \`@/ui\`.`,
      })),
    },
  ],
};

// --- [railway] Бэкенд: база и модули -------------------------------------------

// Маршрут и сервис базу не видят: запросы Drizzle живут только в
// *.repository.ts. Схема (`{{DB_PKG}}/schema`) при этом словарь типов, её читать можно.
const NO_DB_PATHS = [
  { name: 'drizzle-orm', message: 'База доступна только из *.repository.ts.' },
  {
    name: '{{DB_PKG}}',
    message: 'База доступна только из *.repository.ts; типы берут из `{{DB_PKG}}/schema`.',
  },
];
const NO_DB_PATTERNS = [
  { group: ['drizzle-orm/*'], message: 'База доступна только из *.repository.ts.' },
  {
    group: ['**/infra/db', '**/infra/db.js'],
    message: 'Клиент базы доступен только из *.repository.ts.',
  },
];

// Модуль это будущий отдельный сервис: соседи зовут его только через index.js.
// Тогда вынос модуля на свой сервер сводится к замене импорта на HTTP.
// `(?!\.\.)` пропускает выход наверх из modules (config, errors, plugins).
const moduleDoor = (depth) => ({
  regex: `^${'\\.\\./'.repeat(depth)}(?!\\.\\.)[^/]+/(?!index\\.js$).+`,
  message:
    'Чужой модуль доступен только через его index.js: модуль потом уезжает в отдельный сервис.',
});

// --- [firebase] Функции: фичи --------------------------------------------------

// Импорты сверху вниз: index.ts → фича → shared. Фича не импортирует соседнюю
// фичу ни с какой глубины: у файла в src/<фича>/a/b.ts выход к соседу это ../../.
const featureDoor = (depth) => ({
  regex: `^${'\\.\\./'.repeat(depth)}(?!shared/|\\.\\.)[^/]+/`,
  message: 'Фича не импортирует соседнюю фичу: общее уходит в shared/.',
});

// --- Общее --------------------------------------------------------------------

const restricted = ({ patterns = [], paths = [] }) => ({
  'no-restricted-imports': ['error', { patterns, paths }],
});

// Потолок размера файла. Файл длиннее значит две подсистемы или инвентарь, и то,
// и другое режется. Комментарии и пустые строки не считаются: они несут причины.
const MAX_LINES = 500;
const maxLines = (max) => ({
  'max-lines': ['error', { max, skipBlankLines: true, skipComments: true }],
});

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Импорты сверху вниз: внешние → алиасы проекта → относительные.
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'type'],
          pathGroups: [{ pattern: '@/**', group: 'internal' }],
          // Иначе `@/…` похож на scoped-пакет и уезжает во внешние.
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },

  // --- [web] Веб: границы ------------------------------------------------------
  {
    files: ['src/app/**/*.{ts,tsx}'],
    rules: {
      ...restricted({ patterns: [SERVICE_DOORS, UI_DOOR, NO_CROSS_FEATURE] }),
      ...FORBID_RAW_ELEMENTS,
    },
  },
  {
    files: ['src/app/**/components/**/*.{ts,tsx}', 'src/app/**/hooks/**/*.{ts,tsx}'],
    rules: {
      ...restricted({ patterns: [SERVICE_DOORS, UI_DOOR, NO_CROSS_FEATURE, NO_SERVER_IN_CLIENT] }),
      ...FORBID_RAW_ELEMENTS,
    },
  },
  {
    files: ['src/services/**/*.{ts,tsx}'],
    rules: restricted({ patterns: [NO_SCREENS] }),
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: restricted({ patterns: [UI_ISOLATION] }),
  },
  {
    files: ['src/proxy.ts', 'src/routes.ts'],
    rules: restricted({ patterns: [SERVICE_DOORS, UI_DOOR] }),
  },

  // --- [railway] Бэкенд: границы -----------------------------------------------
  {
    files: ['backend/services/*/src/modules/*/*.ts'],
    rules: restricted({ patterns: [moduleDoor(1)] }),
  },
  {
    files: ['backend/services/*/src/modules/*/*/*.ts'],
    rules: restricted({ patterns: [moduleDoor(2)] }),
  },
  {
    files: [
      'backend/services/*/src/modules/*/*.routes.ts',
      'backend/services/*/src/modules/*/*.service.ts',
    ],
    rules: restricted({ patterns: [moduleDoor(1), ...NO_DB_PATTERNS], paths: NO_DB_PATHS }),
  },

  // --- [firebase] Функции: границы ---------------------------------------------
  ...[1, 2, 3].map((depth) => ({
    files: [`backend/firebase/functions/src/*/${'*/'.repeat(depth - 1)}*.ts`],
    ignores: ['backend/firebase/functions/src/shared/**'],
    rules: restricted({ patterns: [featureDoor(depth)] }),
  })),

  // --- Размер файла -------------------------------------------------------------
  {
    files: ['**/*.{ts,tsx,mts,mjs}'],
    ignores: ['**/*.test.{ts,tsx}', '**/migrations/**'],
    rules: maxLines(MAX_LINES),
  },

  globalIgnores([
    '.next/**',
    'out/**',
    '**/build/**',
    '**/dist/**',
    'next-env.d.ts',
    '**/migrations/**',
    'ios/**',
    'android/**',
    'mobile/**',
  ]),
]);
