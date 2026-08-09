/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // onnxruntime-web ships Node-only fallbacks that webpack tries to resolve for
  // the browser bundle. They are never reached at runtime in a browser build.
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    return config;
  },

  async headers() {
    return [
      {
        // The threat-intel API is meant to be consumed by other apps and
        // banks, so it is deliberately open — it serves only aggregate,
        // already-public pattern data.
        source: '/api/v1/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
    ];
  },
};

export default nextConfig;
