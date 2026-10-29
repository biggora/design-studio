import { JsonLd } from "@/app/components/JsonLd";
import { pageJsonLd } from "@/lib/structured-data";
import type { Metadata, ResolvingMetadata } from "next";
import { getSiteConfig } from "@/utils/database";
import { PageShell } from "@/app/components/PageShell";
import { PageHeader } from "@/app/components/PageHeader";
import { SectionHeading } from "@/app/components/SectionHeading";
import { AccentLink } from "@/app/components/AccentLink";

export async function generateMetadata(_props?: unknown, parent?: ResolvingMetadata): Promise<Metadata> {
  const inherited = await parent;
  const config = await getSiteConfig();
  const title = `Publisher Privacy Policy - ${config.name}`;
  const description = `How ${config.name} Publisher uses Facebook and Instagram data and how to request its deletion.`;
  return {
    title,
    description,
    alternates: { canonical: "/publisher-privacy" },
    openGraph: {
      ...inherited?.openGraph,
      url: `https://${config.domain}/publisher-privacy`,
      type: "website",
      siteName: config.name,
      locale: "en_US",
      title,
      description,
    },
  };
}

export default async function PublisherPrivacy() {
  const config = await getSiteConfig();
  const app = `${config.name} Publisher`;
  return (
    <PageShell>
      <JsonLd data={pageJsonLd(config, "/publisher-privacy", `${app}: Privacy Policy`)} />
      <PageHeader title={`${app}: Privacy Policy`} intro="Effective date: October 25, 2026" />
      <div className="prose prose-lg max-w-prose text-foreground">
        <p>
          {app} is an internal publishing tool operated by {config.name}.
          Our authorized administrators use it to share our published Tumblr articles
          and catalog prints on our own Facebook Page and connected professional
          Instagram account. Store visitors do not sign
          into this tool. This policy covers the publishing app; our{" "}
          <AccentLink href="/privacy-policy">website privacy policy</AccentLink>{" "}
          covers visits to this site.
        </p>
        <SectionHeading className="mt-8">Data we use</SectionHeading>
        <p>
          Facebook Login provides the administrator&apos;s name, profile picture and
          app-scoped user ID. We use the selected Page&apos;s name, ID, assigned
          permissions and access tokens to authorize publishing. We read that
          Page&apos;s own posts, including their text, links, images, IDs and publication
          times, to check publication status and avoid duplicate posts.
          For Instagram, we also use the connected professional account&apos;s ID,
          username and its own published media, captions, images,
          links and publication times for the same purpose.
        </p>
        <p>
          The app requests pages_show_list, pages_read_engagement and
          pages_manage_posts, plus instagram_basic and instagram_content_publish
          for the connected Instagram account. Facebook also includes public_profile.
          Access is limited to the Page and Instagram account chosen during
          authorization. Although these
          permissions can make additional Page information available, this publisher
          does not collect follower identities, comments, private messages, friend
          lists or personal timeline posts.
        </p>
        <SectionHeading className="mt-8">Purpose and sharing</SectionHeading>
        <p>
          We use these data to connect our Page, publish approved content, check the
          result and prevent duplicate publication. We send post text, article and
          catalog links, and images to Meta for publication on Facebook and Instagram.
          We obtain article content from our Tumblr blog and print information from
          our public catalog. Links may contain campaign identifiers to measure
          visits; these identifiers describe the content, not a particular visitor.
        </p>
        <p>
          We do not sell Facebook or Instagram data or share access tokens with advertisers.
          Meta processes information under its own{" "}
          <AccentLink href="https://www.facebook.com/privacy/policy/">Privacy Policy</AccentLink>.
          Published posts are public and can be viewed or shared by others.
        </p>
        <SectionHeading className="mt-8">Storage and retention</SectionHeading>
        <p>
          Access tokens and publishing records are stored in the operator&apos;s local
          workspace with access restricted to authorized operators. Tokens are kept
          while the connection is needed. We keep source references, prepared posts,
          publication IDs, timestamps and status records to operate the publisher
          and prevent duplicates. We remove connection data when it is no longer
          needed or following a verified deletion request, unless retention is
          required by law. Tokens are excluded from source control and application
          logs. Removing the app from Facebook revokes its access but does not by
          itself erase our local records.
        </p>
        <SectionHeading id="delete-data" className="mt-8 scroll-mt-8">
          Disconnect the app or request data deletion
        </SectionHeading>
        <ol>
          <li>
            In Facebook, open Settings &amp; privacy → Settings → Business
            integrations, find {app}, and choose Remove. You can also open{" "}
            <AccentLink href="https://www.facebook.com/settings/?tab=business_tools">
              Business integrations
            </AccentLink>{" "}
            directly. This stops further access through that connection.
          </li>
          <li>
            To request deletion of locally stored app data, email{" "}
            <AccentLink href={`mailto:${config.email}?subject=Publisher%20data%20deletion`}>
              {config.email}
            </AccentLink>{" "}
            with the subject &quot;Publisher data deletion&quot;. Include the Page
            or Instagram account name or URL and identify the connection or records concerned. Do not
            send a password or access token.
          </li>
          <li>
            We verify your authority to make the request, remove the associated
            credentials and personal connection data from our active storage and
            publishing records, and confirm completion by email. Any retained
            records required by law are explained in that reply. Existing public
            posts and copies held by Meta or other users are separate; tell us if
            your request also concerns posts on our Page or Instagram account.
          </li>
        </ol>
        <SectionHeading className="mt-8">Questions and changes</SectionHeading>
        <p>
          Contact <AccentLink href={`mailto:${config.email}`}>{config.email}</AccentLink>{" "}
          to ask about this policy or request access to or correction of your app
          data. We update this page and its effective date when our practices change.
        </p>
      </div>
    </PageShell>
  );
}
