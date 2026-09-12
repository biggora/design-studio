import Image from "next/image";
import Link from "next/link";
import { Design } from "@/types/design";

type DesignCardProps = {
  design: Design;
};

export function DesignCard({ design }: DesignCardProps) {
  const imageUrl =
    design.externalImageUrl?.trim() || "/images/no_image_available.svg";

  return (
    <div
      key={design.id}
      className="bg-white shadow-md rounded-lg overflow-hidden flex flex-col"
    >
      <Link
        href={`/designs/${design.id}`}
        className="text-[#124E66] hover:underline"
      >
        <div className="relative w-full aspect-[3/2] overflow-hidden bg-gray-100">
          <Image
            src={imageUrl}
            alt={design.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        </div>
      </Link>
      <div className="p-4 flex flex-col flex-grow">
        <h2 className="text-xl font-semibold mb-2 text-[#212A31]">
          {design.title}
        </h2>
        <p className="text-[#748D92] mb-4">{design.description}</p>
        <p className="text-[#748D92] mb-2">
          Collection:&nbsp;
          <Link href={`/designs?collection=${design.collection}&page=1`}>
            {design.collection}
          </Link>
        </p>
        <Link
          href={`/designs/${design.id}`}
          className="text-[#124E66] hover:underline mt-auto"
        >
          View Design Details
        </Link>
      </div>
    </div>
  );
}
