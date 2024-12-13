import "./globals.css";
import { Inter } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { NextFont } from "next/dist/compiled/@next/font";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { CookieBanner } from "./components/CookieBanner";
import { SiteConfig } from "@/lib/store";
import { getSiteConfig } from "@/utils/supabase";
import ContextWrapper from "@/app/wrapper";

const inter: NextFont = Inter({ subsets: ["latin"] });

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const newConfig: SiteConfig = await getSiteConfig();

  return (
    <ContextWrapper config={newConfig}>
      <html lang="en">
        <head>
          {newConfig?.verification?.pinterest ? (
            <meta
              name="p:domain_verify"
              content={newConfig?.verification?.pinterest as string}
            />
          ) : null}
          {newConfig?.analytics?.google ? (
            <GoogleAnalytics gaId={newConfig.analytics.google} />
          ) : null}
          <link rel="icon" href="/favicon/favicon.ico" />
        </head>
        <body className={`${inter.className} bg-[#D3D9D4]`}>
          <Header />
          <main className="main-container pt-16">{children}</main>
          <Footer />
          <CookieBanner />
        </body>
      </html>
    </ContextWrapper>
  );
}
