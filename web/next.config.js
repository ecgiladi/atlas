/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Proxy /api/* to the FastAPI backend in dev (nginx handles this in prod).
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8003"}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
