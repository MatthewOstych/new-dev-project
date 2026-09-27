import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { schema } from '{{DB_PKG}}';
import { betterAuth } from 'better-auth';
import { admin, bearer } from 'better-auth/plugins';
import { importPKCS8, SignJWT } from 'jose';

import { env } from '../../config/env.js';
import { db } from '../../infra/db.js';

// Apple принимает вместо client secret JWT, подписанный ключом Sign in with Apple
// (.p8), и не дольше полугода. Поэтому secret собирается при старте из ключа, а не
// хранится готовым: готовый молча протух бы через полгода.
async function appleClientSecret(clientId: string, teamId: string, keyId: string, pem: string) {
  const key = await importPKCS8(pem.replace(/\\n/g, '\n'), 'ES256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt(now)
    .setExpirationTime(now + 180 * 24 * 60 * 60)
    .sign(key);
}

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_IOS_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID } =
  env;
const { APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY } = env;

// Провайдер включается, только когда заданы все его ключи: без них вход через
// него невозможен, а полупустой провайдер падал бы на первом запросе.
const google =
  GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
    ? {
        // Мобилки входят по idToken своего client ID: аудитория токена проверяется по всем.
        clientId: [GOOGLE_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID].filter(
          (id): id is string => Boolean(id),
        ),
        clientSecret: GOOGLE_CLIENT_SECRET,
      }
    : undefined;

const apple =
  APPLE_CLIENT_ID && APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_PRIVATE_KEY
    ? async () => ({
        clientId: APPLE_CLIENT_ID,
        clientSecret: await appleClientSecret(
          APPLE_CLIENT_ID,
          APPLE_TEAM_ID,
          APPLE_KEY_ID,
          APPLE_PRIVATE_KEY,
        ),
        // iOS присылает idToken с аудиторией bundle id, а не Services ID.
        appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER,
      })
    : undefined;

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.WEB_ORIGIN, ...(apple ? ['https://appleid.apple.com'] : [])],
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  // Почты пока нет: письма подтверждения и сброса пароля не отправляются.
  emailAndPassword: { enabled: true },
  socialProviders: {
    ...(google ? { google } : {}),
    ...(apple ? { apple } : {}),
  },
  // Удаление аккаунта обязательно для App Store (5.1.1(v)) и Google Play.
  user: { deleteUser: { enabled: true } },
  // bearer: мобилки держат токен сессии сами, куки им неудобны. admin: зона (admin) веба.
  plugins: [bearer(), admin()],
});

export type Auth = typeof auth;
