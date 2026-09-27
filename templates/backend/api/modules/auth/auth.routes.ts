import { fromNodeHeaders } from 'better-auth/node';

import { auth } from './auth.js';

import type { FastifyInstance } from 'fastify';

// Better Auth работает с Fetch API: Request из запроса Fastify → auth.handler →
// ответ обратно. Тело берётся сырым буфером, а не разобранным JSON: колбэк Apple
// приходит формой (form_post), а пересборка JSON меняла бы тело подписанных запросов.
export async function authRoutes(app: FastifyInstance) {
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));

  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
      const body = request.body instanceof Buffer && request.body.length > 0 ? request.body : null;
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          body: body ? new Uint8Array(body) : undefined,
        }),
      );
      reply.status(response.status);
      // set-cookie бывает несколько: getSetCookie отдаёт их по одному, forEach склеил бы.
      for (const cookie of response.headers.getSetCookie()) reply.header('set-cookie', cookie);
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') reply.header(key, value);
      });
      return reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : null);
    },
  });
}
