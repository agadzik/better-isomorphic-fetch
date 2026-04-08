import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/vercel/:path*",
        destination: "https://api.vercel.com/:path*",
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/((?!login).*)",
        missing: [
          {
            type: "cookie",
            key: "authorization",
          },
        ],
        destination: "/login",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
