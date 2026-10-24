import { apiRewriteOrigin } from './lib/api-rewrite.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  ...(process.env.NEXT_DEV_ALLOWED_ORIGIN && {
    allowedDevOrigins: [process.env.NEXT_DEV_ALLOWED_ORIGIN],
  }),
  // The only `next/image` sources are small static logos. Routing them
  // through `/_next/image` adds nothing but a failure point: when the
  // optimiser errors or runs out of quota the sidebar logo breaks and its
  // alt text spills into the brand block. Serve the files as-is.
  images: { unoptimized: true },
  async rewrites() {
    const destination = apiRewriteOrigin(process.env.NEXT_PUBLIC_API_URL);
    if (!destination) return [];
    return [
      {
        source: '/wsapi/:path*',
        destination: `${destination}/:path*`,
      },
    ];
  },
};

export default nextConfig;
