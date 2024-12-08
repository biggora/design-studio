import './globals.css'
import { Inter } from 'next/font/google'
import Head from 'next/head'
import Header from './components/Header'
import Footer from './components/Footer'
import HelmetWrapper from "@/app/components/HelmetWrapper";

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'ThreadQuirk - Innovative Design Studio',
  description: 'ThreadQuirk is a cutting-edge design studio specializing in unique and quirky thread-based designs.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
      <HelmetWrapper>
          <html lang="en">
          <Head>
              <title>{metadata.title}</title>
              <meta name="description" content={metadata.description}/>
              <meta name="keywords" content="thread art, textile design, ThreadQuirk print"/>
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
          <Header/>
          <main className="pt-16 min-h-[500px]">{children}</main>
          <Footer/>
          </body>
          </html>
      </HelmetWrapper>
  )
}

