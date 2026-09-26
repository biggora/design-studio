import Image from "next/image";
import Link from "next/link";
import { Design } from "@/types/design";
import { Card, CardContent } from "@/components/ui/card";

type DesignCardProps = {
  design: Design;
};

export function DesignCard({ design }: DesignCardProps) {
  const imageUrl =
    design.externalImageUrl?.trim() || "/images/no_image_available.svg";

  return (
    <Card key={design.id}>
      <Link
        href={`/designs/${design.id}`}
        className="text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative w-full aspect-square overflow-hidden bg-muted">
          <Image
            src={imageUrl}
            alt={design.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1280px) 25vw, 20vw"
            className="object-cover"
          />
        </div>
      </Link>
      <CardContent className="p-4 flex flex-col flex-grow">
        <h2 className="text-xl font-semibold mb-2 text-foreground line-clamp-2">
          {design.title}
        </h2>
        <p className="text-muted-foreground mb-4 line-clamp-3">{design.description}</p>
        {design.collection && (
          <p className="text-muted-foreground mb-2">
            Collection:&nbsp;
            <Link
              href={`/designs?collection=${encodeURIComponent(design.collection)}`}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {design.collection}
            </Link>
          </p>
        )}
        <Link
          href={`/designs/${design.id}`}
          className="text-accent hover:underline mt-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View Design Details
        </Link>
      </CardContent>
    </Card>
  );
}
