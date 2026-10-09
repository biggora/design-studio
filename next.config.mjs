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
  // Pinterest feeds live at /feeds/pinterest/<collection-slug>.xml, but the
  // App Router only treats [param] as dynamic when it spans a whole segment,
  // so the handler sits at /feeds/pinterest/<collection-slug> and this rewrite
  // strips the extension.
  async rewrites() {
    return [
      {
        source: "/feeds/pinterest/:collectionSlug.xml",
        destination: "/feeds/pinterest/:collectionSlug",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
