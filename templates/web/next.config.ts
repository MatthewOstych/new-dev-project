import { env } from './src/env';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Веб проксирует /api/* в API: куки Better Auth остаются first-party на домене
  // веба, CORS не нужен. Адрес API читается при старте next dev и при сборке.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${env.BACKEND_URL}/api/:path*` }];
  },
  experimental: {
    // Дисковый кэш Turbopack в dev только растёт (десятки ГБ в
    // .next/dev/cache): платим холодным стартом dev, а не диском.
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
