/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  rewrites: () => [
    {
      source: "/xnode-forward/:domain/:call*",
      destination: "https://:domain:34392/:call*",
    },    {
      source: "/xnode-forward-insecure/:ip/:call*",
      destination: "http://:ip:34391/:call*",
    },
    {
      source: "/github-forward/:call*",
      destination: "https://api.github.com/:call*"
    }
  ],
  webpack: config => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding')
    return config
  }
};

export default nextConfig;
