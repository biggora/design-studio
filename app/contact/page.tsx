import { Metadata } from "next";
import { SiteConfig } from "@/lib/store";
import ContactForm from "../components/ContactForm";
import SocialLinks from "../components/SocialLinks";
import ShopLinks from "@/app/components/ShopLinks";
import { getSiteConfig } from "@/utils/supabase";

//       images: ["/static/images/contact-banner.jpg"], // Assuming you have a contact page banner image
export async function generateMetadata(): Promise<Metadata> {
  const config: SiteConfig = await getSiteConfig();
  const title = `Contact Us - ${config.name}`;
  const description = `Get in touch with ${config.name}. We're here to answer your questions and discuss your thread-based design needs.`;
  return {
    title,
    description,
    keywords: "contact, get in touch, thread art, design inquiry",
    openGraph: {
      title,
      description,
    },
  };
}

export default function Contact() {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-4xl font-bold mb-8 text-[#212A31]">Contact Us</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div>
          <h2 className="text-2xl font-semibold mb-4 text-[#212A31]">
            Get in Touch
          </h2>
          <ContactForm />
        </div>
        <div>
          <SocialLinks />
          <ShopLinks />
          {/*<div className="mt-6">*/}
          {/*  <p className="text-[#212A31]">Email: {config.email}</p>*/}
          {/*  {config.phone && <p className="text-[#212A31]">Phone: {config.phone}</p>}*/}
          {/*  <p className="text-[#212A31]">Address: {config.address}</p>*/}
          {/*</div>*/}
        </div>
      </div>
    </div>
  );
}
