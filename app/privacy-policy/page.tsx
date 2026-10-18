import { Metadata } from "next";
import { SiteConfig } from "@/lib/store";
import { getSiteConfig } from "@/utils/database";
import { AccentLink } from "@/app/components/AccentLink";
import { PageShell } from "@/app/components/PageShell";
import { PageHeader } from "@/app/components/PageHeader";
import { SectionHeading } from "@/app/components/SectionHeading";

export async function generateMetadata(): Promise<Metadata> {
  const config: SiteConfig = await getSiteConfig();
  const title = `Privacy Policy - ${config.name}`;
  const description = `Read our privacy policy to understand how ${config.name} collects, uses, and protects your personal information.`;
  return {
    title,
    description,
    keywords: "privacy policy, data protection, personal information",
    alternates: { canonical: "/privacy-policy" },
    openGraph: {
      url: `https://${config.domain}/privacy-policy`,
      type: "website",
      title,
      description,
    },
    twitter: {
      title,
      description,
    },
  };
}

export default async function PrivacyPolicy() {
  const config: SiteConfig = await getSiteConfig();
  return (
    <PageShell>
      <PageHeader title="Privacy Policy" />
      <div className="prose prose-lg max-w-none text-foreground">
        <p className="mb-4">Effective Date: {config.policyUpdateDate}</p>

        <SectionHeading className="mt-8">1. Introduction</SectionHeading>
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

        <SectionHeading className="mt-8">
          2. Information We Collect
        </SectionHeading>
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

        <SectionHeading className="mt-8">
          3. How We Collect Information
        </SectionHeading>
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

        <SectionHeading className="mt-8">
          4. Use of Your Information
        </SectionHeading>
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

        <SectionHeading className="mt-8">
          5. Analytics &amp; Cookies
        </SectionHeading>
        <p className="mb-4">
          We use a small number of cookies and similar storage on your device:
        </p>
        <ul className="list-disc pl-6 mb-4">
          <li>
            <strong>Analytics (Google Analytics):</strong> loads only after
            you accept analytics in our cookie banner. If you decline, no
            analytics tools are loaded at all.
          </li>
          <li>
            <strong>Your consent choice:</strong> stored locally in your
            browser (localStorage) so we don&apos;t ask again; clear your
            browser data for this site to change it.
          </li>
        </ul>
        <p className="mb-4">
          We do not use advertising or tracking cookies on this site.
        </p>

        <SectionHeading className="mt-8">
          6. Affiliate Links &amp; Third-Party Marketplaces
        </SectionHeading>
        <p className="mb-4">
          This website links to third-party print-on-demand marketplaces
          (such as Redbubble, TeePublic, and Tostadora) where our designs can
          be purchased. Some of those links are affiliate links: if you buy
          through them, we may earn a commission from the marketplace at no
          additional cost to you. See our{" "}
          <AccentLink href="/disclosure">affiliate disclosure</AccentLink> for
          details.
        </p>
        <p className="mb-4">
          Once you follow a link to a marketplace, that site&apos;s own
          privacy policy and cookie practices apply — we have no control over,
          and are not responsible for, their use of your information.
        </p>
      </div>
    </PageShell>
  );
}
