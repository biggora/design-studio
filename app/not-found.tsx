import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { PageShell } from "@/app/components/PageShell";
import { PageHeader } from "@/app/components/PageHeader";

export default function NotFound() {
  return (
    <PageShell className="py-24 text-center">
      <PageHeader title="Page not found" className="mb-4" />
      <p className="text-muted-foreground mb-8 max-w-prose mx-auto">
        The page you are looking for doesn&apos;t exist or may have moved.
        Every design in the catalog is one click away.
      </p>
      <div className="flex flex-wrap justify-center gap-4">
        <Link href="/designs" className={buttonVariants()}>
          Browse designs
        </Link>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Go home
        </Link>
      </div>
    </PageShell>
  );
}
