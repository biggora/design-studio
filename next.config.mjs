/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.redbubble.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.redbubble.net",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.placeholder.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
