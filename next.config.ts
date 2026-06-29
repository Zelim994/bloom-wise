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

const nextConfig: NextConfig = {
  allowedDevOrigins: tunnelOrigins,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
      allowedOrigins: tunnelOrigins,
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
