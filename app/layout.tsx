"use client";

import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Head from "next/head";
import Header from "./components/Header";
import Footer from "./components/Footer";
import HelmetWrapper from "@/app/components/HelmetWrapper";
import { CookieBanner } from "./components/CookieBanner";
import { SiteConfig, useSiteConfigStore } from "@/lib/store";
import { supabase } from "@/utils/supabase";
import { useEffect } from "react";
import { mapDataToConfig } from "@/lib/config";
import { ConfigProp } from "@/types/config";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { config, updateConfig } = useSiteConfigStore();

  const metadata: Metadata = {
    title: `${config.name} - ${config.intro}`,
    description: config.description,
    keywords: config.keywords,
  };

  useEffect(() => {
    const getSiteConfig = async () => {
      const { data } = await supabase.from("studio").select("*");
      const newConfig: SiteConfig = mapDataToConfig(data as ConfigProp[]);
      updateConfig(newConfig);
    };
    void getSiteConfig();
  }, [updateConfig]);

  return (
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
        </Head>
        <body className={`${inter.className} bg-[#D3D9D4]`}>
          <Header />
          <main className="pt-16 min-h-[500px]">{children}</main>
          <Footer />
          <CookieBanner />
        </body>
      </html>
    </HelmetWrapper>
  );
}
