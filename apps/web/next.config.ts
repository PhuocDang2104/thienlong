import type { NextConfig } from "next";

if (process.env.NODE_ENV === "production") {
  for (const name of ["NEXT_PUBLIC_API_BASE_URL", "NEXT_PUBLIC_APP_URL"]) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required for production builds.`);
    if (!/^https?:\/\//.test(value)) throw new Error(`${name} must be an absolute HTTP(S) URL.`);
  }
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: { cpus: 1, webpackMemoryOptimizations: true, webpackBuildWorker: true },
  webpack(config) {
    // Avoid large persistent caches on small development machines and CI runners.
    config.cache = false;
    return config;
  },
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
      { key: "Cache-Control", value: "no-store" },
    ] }];
  },
};
export default nextConfig;
