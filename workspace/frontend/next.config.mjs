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
    const api = process.env.NEXT_PUBLIC_API_URL || '';
    let destination = '';
    try {
      const url = new URL(api);
      const dev = process.env.AGHUB_DEV_LOOPBACK === '1' || process.env.NEXT_PUBLIC_AGHUB_DEV_LOOPBACK === '1'
        && url.protocol === 'http:'
        && url.host === '127.0.0.1:18000';
      if (url.protocol === 'https:' || dev) destination = `${url.protocol}//${url.host}`;
    } catch {
      destination = '';
    }
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
