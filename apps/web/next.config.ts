import type { NextConfig } from 'next';
import { buildSecurityHeaders } from './lib/security/headers';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: buildSecurityHeaders({
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          isDevelopment: process.env.NODE_ENV === 'development'
        })
      }
    ];
  }
};

export default nextConfig;
