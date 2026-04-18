import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.discogs.com",
      },
      {
        protocol: "https",
        hostname: "**.discogs.com",
      },
    ],
  },
  async rewrites() {
    const apiUrl = process.env.API_URL || "http://localhost:8080";
    return [
      {
        source: "/api/user",
        destination: `${apiUrl}/api/user`,
      },
      {
        source: "/api/user/:path*",
        destination: `${apiUrl}/api/user/:path*`,
      },
    ];
  },
};

export default nextConfig;
