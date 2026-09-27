import { parseArgs } from 'node:util';

import { makeSignature } from 'better-auth/crypto';

import { env } from '../src/config/env.js';
import { auth } from '../src/modules/auth/index.js';

// Вход агентом (скилл /dev-login): сессия пишется прямо в локальную базу через
// внутренний адаптер Better Auth, без OAuth и без пароля. Продовый код ради
// этого не меняется, а скрипт отказывается работать с чужим сервером.
const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    admin: { type: 'boolean', default: false },
    revoke: { type: 'boolean', default: false },
  },
});

const host = new URL(env.DATABASE_URL).hostname;
if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
  console.error(`dev-session: DATABASE_URL points to ${host}; only localhost is allowed`);
  process.exit(1);
}
if (!values.email) {
  console.error('dev-session: --email is required');
  process.exit(1);
}

const ctx = await auth.$context;
const email = values.email.toLowerCase();
const found = await ctx.internalAdapter.findUserByEmail(email);
const user =
  found?.user ??
  (await ctx.internalAdapter.createUser(
    { email, name: email.split('@')[0], emailVerified: true },
    { method: 'admin' },
  ));

if (values.revoke) {
  await ctx.internalAdapter.deleteUserSessions(user.id);
  console.log(`revoked all sessions of ${email}`);
  process.exit(0);
}
// role появляется в таблице user с плагином admin, базовый тип User его не знает.
if (values.admin && (user as { role?: string | null }).role !== 'admin') {
  await ctx.internalAdapter.updateUser(user.id, { role: 'admin' });
}

const session = await ctx.internalAdapter.createSession(user.id);
// Кука подписана тем же секретом, что ставит сам Better Auth: <token>.<hmac>.
const signed = `${session.token}.${await makeSignature(session.token, ctx.secret)}`;

console.log(`user:         ${email}${values.admin ? ' (admin)' : ''}`);
console.log(`cookie name:  ${ctx.authCookies.sessionToken.name}`);
console.log(`cookie value: ${encodeURIComponent(signed)}`);
console.log(`bearer:       ${signed}`);
process.exit(0);
