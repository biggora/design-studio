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
        className="text-accent hover:underline"
      >
        <div className="relative w-full aspect-[3/2] overflow-hidden bg-muted">
          <Image
            src={imageUrl}
            alt={design.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        </div>
      </Link>
      <CardContent className="p-4 flex flex-col flex-grow">
        <h2 className="text-xl font-semibold mb-2 text-foreground">
          {design.title}
        </h2>
        <p className="text-muted-foreground mb-4">{design.description}</p>
        <p className="text-muted-foreground mb-2">
          Collection:&nbsp;
          <Link href={`/designs?collection=${design.collection}&page=1`}>
            {design.collection}
          </Link>
        </p>
        <Link
          href={`/designs/${design.id}`}
          className="text-accent hover:underline mt-auto"
        >
          View Design Details
        </Link>
      </CardContent>
    </Card>
  );
}
