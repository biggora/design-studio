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
    ],
  },
};

export default nextConfig;
