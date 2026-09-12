import "./globals.css";
import { Inter } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { CookieBanner } from "./components/CookieBanner";
import { SiteConfig } from "@/lib/store";
import { getSiteConfig } from "@/utils/database";
import ContextWrapper from "@/app/wrapper";

const inter = Inter({ subsets: ["latin"] });

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

  const favIcon = newConfig?.favicon || "/favicon/favicon.ico";
  const themeLink = newConfig?.themeLink;

  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#D3D9D4]`}>
        {newConfig?.verification?.pinterest ? (
          <meta
            name="p:domain_verify"
            content={newConfig?.verification?.pinterest as string}
          />
        ) : null}
        {isAllowedThemeUrl(themeLink) ? (
          <link rel="stylesheet" crossOrigin="anonymous" href={themeLink} />
        ) : null}
        <link rel="icon" href={favIcon} />
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
