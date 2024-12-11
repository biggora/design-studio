"use client";

import { useContext } from "react";
import { ConfigContext } from "@/app/wrapper";

export default function TermsOfService() {
  const config = useContext(ConfigContext);
  return (
    <div className="container mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold mb-8 text-[#212A31]">
        Terms of Service
      </h1>
      <div className="prose prose-lg max-w-none text-[#212A31]">
        <p className="mb-4">Effective Date: {config.policyUpdateDate}</p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">
          1. Acceptance of Terms
        </h2>
        <p>
          By accessing and using the services provided by {config.name}
          (&quot;Company&quot;, &quot;we&quot;, &quot;our&quot;,
          &quot;us&quot;), including our website [{config.domain}]
          (&quot;Website&quot;), you (&quot;User&quot;, &quot;you&quot;,
          &quot;your&quot;) agree to comply with and be bound by these Terms of
          Service. If you do not agree to these terms, please do not use our
          services or Website.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">
          2. Services Provided
        </h2>
        <p>
          {config.name} offers design services, including but not limited to
          graphic design, branding, and web design (&quot;Services&quot;). The
          specifics of each project will be outlined in individual agreements or
          proposals.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">
          3. User Responsibilities
        </h2>
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
                Infringe upon the intellectual property rights of the Company or
                third parties.
              </li>
              <li>Distribute harmful or malicious content.</li>
            </ul>
          </li>
        </ul>

        <h2 className="text-2xl font-semibold mt-8 mb-4">
          4. Intellectual Property
        </h2>
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

        <h2 className="text-2xl font-semibold mt-8 mb-4">5. Payment Terms</h2>
        <ul className="list-disc pl-6 mb-4">
          <li>
            Fees: Fees for Services will be outlined in individual agreements or
            proposals.
          </li>
          <li>
            Payment Schedule: Payments are due as specified in the agreement.
            Late payments may incur additional fees.
          </li>
          <li>
            Refunds: Refund policies will be specified in individual agreements.
          </li>
        </ul>

        <h2 className="text-2xl font-semibold mt-8 mb-4">
          6. Limitation of Liability
        </h2>
        <p>
          {config.name} is not liable for any indirect, incidental, or
          consequential damages arising from the use of our Services or Website.
          Our total liability is limited to the amount paid by you for the
          specific Service in question.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">7. Termination</h2>
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

        <h2 className="text-2xl font-semibold mt-8 mb-4">8. Governing Law</h2>
        <p>
          These Terms are governed by and construed in accordance with the laws
          of Latvia, without regard to its conflict of law principles.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">
          9. Changes to Terms
        </h2>
        <p>
          {config.name} reserves the right to modify these Terms at any time.
          Changes will be effective immediately upon posting on our Website.
          Continued use of our Services constitutes acceptance of the revised
          Terms.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">
          10. Contact Information
        </h2>
        <p>
          For any questions or concerns regarding these Terms, please contact us
          at:
        </p>
        <p>
          Email: {config.email}
          <br />
          Address: {config.address}
        </p>
      </div>
    </div>
  );
}
