import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { CookieBanner } from "./components/CookieBanner";
import { AnalyticsGate } from "./components/AnalyticsGate";
import { JsonLd } from "@/app/components/JsonLd";
import { SiteConfig } from "@/lib/store";
import { getSiteConfig } from "@/utils/database";
import ContextWrapper from "@/app/wrapper";
import baseConfig from "@/config/config.json";
import { toClientConfig } from "@/lib/client-config";

// Safety-net TTL for the studio config cache; edits also trigger
// /api/revalidate/config for near-immediate invalidation. Hourly, not every
// 5 min: every regeneration of every page is an ISR write on the Hobby plan.
export const revalidate = 3600;

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
});

export async function generateMetadata(): Promise<Metadata> {
  const newConfig: SiteConfig = await getSiteConfig();

  // A deployment's own favicon wins, then its logo; otherwise the bundled generic set.
  const brandIcon =
    newConfig?.favicon && newConfig.favicon !== baseConfig.favicon
      ? newConfig.favicon
      : newConfig?.siteLogo && newConfig.siteLogo !== baseConfig.siteLogo
        ? newConfig.siteLogo
        : undefined;

  return {
    metadataBase: new URL(`https://${newConfig.domain}`),
    title: {
      default: `${newConfig.name} - ${newConfig.intro}`,
      template: "%s",
    },
    description: newConfig.description,
    applicationName: newConfig.name,
    icons: brandIcon
      ? { icon: brandIcon, apple: brandIcon }
      : {
          icon: [
            { url: "/favicon/favicon.ico" },
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
  themeColor: "#14181C",
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
  const sameAs = [...new Set([
    ...Object.values(newConfig?.social || {}),
    newConfig.representation.redbuble,
    newConfig.representation.teepublic,
    newConfig.representation.tostadora || newConfig.representation.tostaDora,
    newConfig.representation.zazzle,
  ].filter(Boolean))];

  const jsonLdData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: newConfig.name,
      url: siteUrl,
      ...(newConfig.description ? { description: newConfig.description } : {}),
      ...(newConfig.siteLogo ? { logo: new URL(newConfig.siteLogo, `${siteUrl}/`).href } : {}),
      ...(newConfig.email ? { email: newConfig.email } : {}),
      ...(sameAs.length ? { sameAs } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      name: newConfig.name,
      url: siteUrl,
      inLanguage: "en",
      publisher: { "@id": `${siteUrl}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${siteUrl}/designs?search={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
  ];

  return (
    <html lang="en">
      <body className={`${inter.variable} ${poppins.variable} font-sans bg-background`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:inline-flex focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <JsonLd data={jsonLdData} />
        {/* Impact (Redbubble affiliate) verification requires a `value` attribute,
            which the Metadata API cannot emit; React hoists raw meta into <head>. */}
        {newConfig?.verification?.impact ? (
          <meta
            name="impact-site-verification"
            {...{ value: newConfig.verification.impact }}
          />
        ) : null}
        {isAllowedThemeUrl(themeLink) ? (
          <link rel="stylesheet" crossOrigin="anonymous" href={themeLink} />
        ) : null}
        {newConfig?.analytics?.google ? (
          <AnalyticsGate gaId={newConfig.analytics.google} domain={newConfig.domain} />
        ) : null}
        <ContextWrapper config={toClientConfig(newConfig)}>
          <Header />
          <main id="main-content" className="main-container pt-16">
            {children}
          </main>
          <CookieBanner />
          <Footer />
        </ContextWrapper>
      </body>
    </html>
  );
}
