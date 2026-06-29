import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;

const tunnelOrigins = [
  "*.lhr.life",
  "*.localhost.run",
  "localhost.run",
  "*.trycloudflare.com",
  "*.pinggy.link",
  "*.pinggy.io",
]

const devTunnelOrigins =
  process.env.NODE_ENV === "development" ? tunnelOrigins : []

const nextConfig: NextConfig = {
  allowedDevOrigins: devTunnelOrigins,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
      allowedOrigins: devTunnelOrigins,
    },
  },
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
