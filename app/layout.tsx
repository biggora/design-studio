import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { CookieBanner } from "./components/CookieBanner";
import { JsonLd } from "@/app/components/JsonLd";
import { SiteConfig } from "@/lib/store";
import { getSiteConfig } from "@/utils/database";
import ContextWrapper from "@/app/wrapper";

const inter = Inter({ subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const newConfig: SiteConfig = await getSiteConfig();
  const favIcon = newConfig?.favicon || "/favicon/favicon.ico";

  return {
    metadataBase: new URL(`https://${newConfig.domain}`),
    title: {
      default: `${newConfig.name} - ${newConfig.intro}`,
      template: "%s",
    },
    description: newConfig.description,
    applicationName: newConfig.name,
    icons: {
      icon: [
        { url: favIcon },
        { url: "/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
        { url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      ],
      apple: "/favicon/apple-touch-icon.png",
    },
    manifest: "/favicon/site.webmanifest",
    ...(newConfig?.verification?.pinterest
      ? {
          verification: {
            other: { "p:domain_verify": newConfig.verification.pinterest },
          },
        }
      : {}),
    openGraph: {
      siteName: newConfig.name,
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#212A31",
};

function isAllowedThemeUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const allowedDomains = [
      "fonts.googleapis.com",
      "cdn.jsdelivr.net",
      "cdnjs.cloudflare.com",
    ];
    return (
      parsed.protocol === "https:" &&
      allowedDomains.includes(parsed.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const newConfig: SiteConfig = await getSiteConfig();

  const themeLink = newConfig?.themeLink;
  const siteUrl = `https://${newConfig.domain}`;
  const sameAs = Object.values(newConfig?.social || {}).filter(Boolean);

  const jsonLdData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: newConfig.name,
      url: siteUrl,
      ...(newConfig.siteLogo ? { logo: newConfig.siteLogo } : {}),
      ...(newConfig.email ? { email: newConfig.email } : {}),
      ...(sameAs.length ? { sameAs } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: newConfig.name,
      url: siteUrl,
    },
  ];

  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#D3D9D4]`}>
        <JsonLd data={jsonLdData} />
        {isAllowedThemeUrl(themeLink) ? (
          <link rel="stylesheet" crossOrigin="anonymous" href={themeLink} />
        ) : null}
        {newConfig?.analytics?.google ? (
          <GoogleAnalytics gaId={newConfig?.analytics?.google || ""} />
        ) : null}
        <ContextWrapper config={newConfig}>
          <Header />
          <main className="main-container pt-16">{children}</main>
          <Footer />
          <CookieBanner />
        </ContextWrapper>
      </body>
    </html>
  );
}
