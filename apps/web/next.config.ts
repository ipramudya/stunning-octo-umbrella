import type { NextConfig } from 'next';

const gatewayUrl = process.env.GATEWAY_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  reactCompiler: true,
  rewrites() {
    return [
      {
        destination: `${gatewayUrl}/api/:path*`,
        source: '/api/:path*',
      },
    ];
  },
};

export default nextConfig;
