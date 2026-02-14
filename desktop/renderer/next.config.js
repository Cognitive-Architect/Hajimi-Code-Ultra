/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: '.next',
  images: {
    unoptimized: true,
  },
  // Electron中不需要trailingSlash
  trailingSlash: false,
  // 禁用Image优化（Electron不支持）
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.target = 'electron-renderer';
    }
    return config;
  },
};

module.exports = nextConfig;
