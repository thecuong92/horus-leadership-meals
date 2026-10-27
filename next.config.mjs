/** @type {import('next').NextConfig} */
const isCfExport = process.env.CF_EXPORT === '1';

const nextConfig = {
  ...(isCfExport ? { output: 'export' } : {}),
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
