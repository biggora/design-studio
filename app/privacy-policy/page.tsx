import { Metadata } from "next";
import { SiteConfig } from "@/lib/store";
import { getSiteConfig } from "@/utils/database";

export async function generateMetadata(): Promise<Metadata> {
  const config: SiteConfig = await getSiteConfig();
  const title = `Privacy Policy - ${config.name}`;
  const description = `Read our privacy policy to understand how ${config.name} collects, uses, and protects your personal information.`;
  return {
    title,
    description,
    keywords: "privacy policy, data protection, personal information",
    openGraph: {
      url: `https://${config.domain}/privacy-policy`,
      type: "website",
      title,
      description,
    },
  };
}

export default async function PrivacyPolicy() {
  const config: SiteConfig = await getSiteConfig();
  return (
    <>
      <div className="container mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold mb-8 text-[#212A31]">
          Privacy Policy
        </h1>
        <div className="prose prose-lg max-w-none text-[#212A31]">
          <p className="mb-4">Effective Date: {config.policyUpdateDate}</p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">1. Introduction</h2>
          <p>
            Welcome to {config.name} (&quot;Company&quot;, &quot;we&quot;,
            &quot;our&quot;, &quot;us&quot;). We are committed to protecting
            your personal information and your right to privacy. This Privacy
            Policy explains how we collect, use, disclose, and safeguard your
            information when you visit our website [{config.domain}], use our
            services, or engage with us in other ways. Please read this policy
            carefully to understand our practices regarding your personal
            information.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">
            2. Information We Collect
          </h2>
          <p>We may collect and process the following data about you:</p>
          <ul className="list-disc pl-6 mb-4">
            <li>
              Personal Identification Information: Name, email address, phone
              number, and postal address.
            </li>
            <li>
              Technical Data: IP address, browser type and version, time zone
              setting, browser plug-in types and versions, operating system and
              platform, and other technology on the devices you use to access
              this website.
            </li>
            <li>
              Usage Data: Information about how you use our website, products,
              and services.
            </li>
            <li>
              Marketing and Communications Data: Your preferences in receiving
              marketing from us and your communication preferences.
            </li>
          </ul>

          <h2 className="text-2xl font-semibold mt-8 mb-4">
            3. How We Collect Information
          </h2>
          <p>We collect information from and about you through:</p>
          <ul className="list-disc pl-6 mb-4">
            <li>
              Direct Interactions: When you provide it to us by filling in forms
              or corresponding with us by post, phone, email, or otherwise.
            </li>
            <li>
              Automated Technologies: As you interact with our website, we may
              automatically collect Technical Data about your equipment,
              browsing actions, and patterns. We collect this data using
              cookies, server logs, and other similar technologies.
            </li>
            <li>
              Third Parties or Publicly Available Sources: We may receive
              personal data about you from various third parties and public
              sources.
            </li>
          </ul>

          <h2 className="text-2xl font-semibold mt-8 mb-4">
            4. Use of Your Information
          </h2>
          <p>We use the information we collect in the following ways:</p>
          <ul className="list-disc pl-6 mb-4">
            <li>To provide, operate, and maintain our website and services.</li>
            <li>
              To improve, personalize, and expand our website and services.
            </li>
            <li>
              To understand and analyze how you use our website and services.
            </li>
            <li>
              To develop new products, services, features, and functionality.
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}
