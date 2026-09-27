import { z } from 'zod';

// Единственное место, где читается process.env. Ошибка разбора роняет процесс
// на старте с понятным текстом: лучше не подняться, чем работать без ключа.

// Пустое значение из .env (`KEY=`) считается «не задано»: .env копируется из
// .env.example, где у необязательных ключей значений нет.
const optional = z.preprocess((value) => (value === '' ? undefined : value), z.string().optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default({{API_PORT}}),
  DATABASE_URL: z.url(),
  // Адрес веба: CORS и trustedOrigins Better Auth. Локально его выставляет scripts/dev.mjs.
  WEB_ORIGIN: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  // Публичный адрес, по которому клиенты ходят в /api/auth: адрес веба, он проксирует /api/*.
  BETTER_AUTH_URL: z.url(),

  // Провайдеры входа: провайдер включается, только когда заданы его ключи.
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  GOOGLE_IOS_CLIENT_ID: optional,
  GOOGLE_ANDROID_CLIENT_ID: optional,
  APPLE_CLIENT_ID: optional,
  APPLE_TEAM_ID: optional,
  APPLE_KEY_ID: optional,
  APPLE_PRIVATE_KEY: optional,
  APPLE_APP_BUNDLE_IDENTIFIER: optional,

  // Stripe: заготовка. С первым кодом billing ключи становятся обязательными.
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment (backend/services/api/.env):\n${issues}`);
}

export const env = parsed.data;
export type Env = typeof env;
