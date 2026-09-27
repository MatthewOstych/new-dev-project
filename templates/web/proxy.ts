import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

import { routes } from '@/routes';

// Оптимистичный гард: смотрит только, есть ли кука сессии, и уводит гостя на
// вход, не дожидаясь рендера. Настоящая проверка в layout зоны (requireSession,
// requireAdmin) и на бэке: куку можно подделать, сессию нет.
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  const login = new URL(routes.login, request.url);
  return NextResponse.redirect(login);
}

// matcher обязан быть литералом (Next разбирает его статически), поэтому пути
// зон повторены здесь, а не взяты из routes.ts.
export const config = {
  matcher: ['/account/:path*', '/admin/:path*'],
};
