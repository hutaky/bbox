import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true
  },
  webpack: (config) => {
    // Make "@/..." point to the "src" directory
    config.resolve.alias["@" ] = path.join(__dirname, "src");
    return config;
  }
};

export default nextConfig;
