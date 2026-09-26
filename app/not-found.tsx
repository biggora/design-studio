import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
      <h1 className="text-4xl font-bold mb-4 text-foreground">Page not found</h1>
      <p className="text-muted-foreground mb-8 max-w-prose mx-auto">
        The page you are looking for doesn&apos;t exist or may have moved.
        Every design in the catalog is one click away.
      </p>
      <div className="flex flex-wrap justify-center gap-4">
        <Link href="/designs" className={buttonVariants({})}>
          Browse designs
        </Link>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Go home
        </Link>
      </div>
    </div>
  );
}
