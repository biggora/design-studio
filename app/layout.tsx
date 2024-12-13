import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { NextFont } from "next/dist/compiled/@next/font";
import Head from "next/head";
import Header from "./components/Header";
import Footer from "./components/Footer";
import HelmetWrapper from "@/app/components/HelmetWrapper";
import { CookieBanner } from "./components/CookieBanner";
import { SiteConfig } from "@/lib/store";
import { supabase } from "@/utils/supabase";
import { mapDataToConfig } from "@/lib/config";
import { ConfigProp } from "@/types/config";
import ContextWrapper from "@/app/wrapper";

const inter: NextFont = Inter({ subsets: ["latin"] });

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data } = await supabase.from("studio").select("*");
  const newConfig: SiteConfig = mapDataToConfig(data as ConfigProp[]);

  const metadata: Metadata = {
    title: `${newConfig.name} - ${newConfig.intro}`,
    description: newConfig.description,
    keywords: newConfig.keywords,
  };

  return (
    <ContextWrapper config={newConfig}>
      <HelmetWrapper>
        <html lang="en">
          <Head>
            <title>{metadata.title as string}</title>
            <meta name="description" content={metadata.description as string} />
            <meta name="keywords" content={metadata.keywords as string} />
            <link
              rel="stylesheet"
              type="text/css"
              href="https://cdnjs.cloudflare.com/ajax/libs/slick-carousel/1.6.0/slick.min.css"
            />
            <link
              rel="stylesheet"
              type="text/css"
              href="https://cdnjs.cloudflare.com/ajax/libs/slick-carousel/1.6.0/slick-theme.min.css"
            />
            {newConfig?.verification?.pinterest ? (
              <meta
                name="p:domain_verify"
                content={newConfig.verification.pinterest}
              />
            ) : (
              ""
            )}
            {newConfig?.analytics?.google ? (
              <GoogleAnalytics gaId={newConfig?.analytics?.google} />
            ) : (
              ""
            )}
            <link rel="icon" href="/static/favicon/favicon.ico" />
          </Head>
          <body className={`${inter.className} bg-[#D3D9D4]`}>
            <Header />
            <main className="main-container pt-16">{children}</main>
            <Footer />
            <CookieBanner />
          </body>
        </html>
      </HelmetWrapper>
    </ContextWrapper>
  );
}
