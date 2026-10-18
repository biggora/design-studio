import { Metadata } from "next";
import { SiteConfig } from "@/lib/store";
import { getSiteConfig } from "@/utils/database";
import { PageShell } from "@/app/components/PageShell";
import { PageHeader } from "@/app/components/PageHeader";
import { SectionHeading } from "@/app/components/SectionHeading";

export async function generateMetadata(): Promise<Metadata> {
  const config: SiteConfig = await getSiteConfig();
  const title = `Terms of Service - ${config.name}`;
  const description = `Read our terms of service to understand the agreement between you and ${config.name} regarding the use of our website and services.`;
  return {
    title,
    description,
    keywords: "terms of service, user agreement, legal, conditions of use",
    alternates: { canonical: "/terms-of-service" },
    openGraph: {
      url: `https://${config.domain}/terms-of-service`,
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

export default async function TermsOfService() {
  const config: SiteConfig = await getSiteConfig();
  return (
    <PageShell>
      <PageHeader title="Terms of Service" />
      <div className="prose prose-lg max-w-prose text-foreground">
        <p className="mb-4">Effective Date: {config.policyUpdateDate}</p>

        <SectionHeading className="mt-8">1. Acceptance of Terms</SectionHeading>
        <p>
          By accessing and using the services provided by {config.name}
          (&quot;Company&quot;, &quot;we&quot;, &quot;our&quot;,
          &quot;us&quot;), including our website [{config.domain}]
          (&quot;Website&quot;), you (&quot;User&quot;, &quot;you&quot;,
          &quot;your&quot;) agree to comply with and be bound by these Terms
          of Service. If you do not agree to these terms, please do not use
          our services or Website.
        </p>

        <SectionHeading className="mt-8">2. Services Provided</SectionHeading>
        <p>
          {config.name} offers design services, including but not limited to
          graphic design, branding, and web design (&quot;Services&quot;). The
          specifics of each project will be outlined in individual agreements
          or proposals.
        </p>

        <SectionHeading className="mt-8">3. User Responsibilities</SectionHeading>
        <ul className="list-disc pl-6 mb-4">
          <li>
            Accurate Information: You agree to provide accurate and complete
            information when engaging with our Services.
          </li>
          <li>
            Compliance: You agree to use our Services in compliance with all
            applicable laws and regulations.
          </li>
          <li>
            Prohibited Actions: You agree not to:
            <ul className="list-disc pl-6 mt-2">
              <li>Use the Services for any unlawful purpose.</li>
              <li>
                Infringe upon the intellectual property rights of the Company
                or third parties.
              </li>
              <li>Distribute harmful or malicious content.</li>
            </ul>
          </li>
        </ul>

        <SectionHeading className="mt-8">4. Intellectual Property</SectionHeading>
        <ul className="list-disc pl-6 mb-4">
          <li>
            Ownership: All content, designs, and materials created by
            {config.name} are the intellectual property of the Company unless
            otherwise agreed upon.
          </li>
          <li>
            License: Upon full payment, and unless otherwise specified,
            {config.name} grants you a non-exclusive, non-transferable license
            to use the final deliverables for their intended purpose.
          </li>
        </ul>

        <SectionHeading className="mt-8">5. Payment Terms</SectionHeading>
        <ul className="list-disc pl-6 mb-4">
          <li>
            Fees: Fees for Services will be outlined in individual agreements
            or proposals.
          </li>
          <li>
            Payment Schedule: Payments are due as specified in the agreement.
            Late payments may incur additional fees.
          </li>
          <li>
            Refunds: Refund policies will be specified in individual
            agreements.
          </li>
        </ul>

        <SectionHeading className="mt-8">
          6. Limitation of Liability
        </SectionHeading>
        <p>
          {config.name} is not liable for any indirect, incidental, or
          consequential damages arising from the use of our Services or
          Website. Our total liability is limited to the amount paid by you
          for the specific Service in question.
        </p>

        <SectionHeading className="mt-8">7. Termination</SectionHeading>
        <ul className="list-disc pl-6 mb-4">
          <li>
            By User: You may terminate the use of our Services at any time by
            providing written notice.
          </li>
          <li>
            By Company: We reserve the right to terminate or suspend access to
            our Services for any reason, including breach of these Terms.
          </li>
        </ul>

        <SectionHeading className="mt-8">8. Governing Law</SectionHeading>
        <p>
          These Terms are governed by and construed in accordance with the
          laws of Latvia, without regard to its conflict of law principles.
        </p>

        <SectionHeading className="mt-8">9. Changes to Terms</SectionHeading>
        <p>
          {config.name} reserves the right to modify these Terms at any time.
          Changes will be effective immediately upon posting on our Website.
          Continued use of our Services constitutes acceptance of the revised
          Terms.
        </p>

        <SectionHeading className="mt-8">
          10. Contact Information
        </SectionHeading>
        <p>
          For any questions or concerns regarding these Terms, please contact
          us at:
        </p>
        <p>
          Email: {config.email}
          <br />
          Address: {config.address}
        </p>
      </div>
    </PageShell>
  );
}
