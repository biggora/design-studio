import Image from "next/image";
import { designCardHeight, designCardWidth } from "@/lib/image";
import Link from "next/link";
import { Design } from "@/types/design";

type DesignCardProps = {
  design: Design;
};

export function DesignCard({ design }: DesignCardProps) {
  return (
    <div
      key={design.id}
      className="bg-white shadow-md rounded-lg overflow-hidden flex flex-col"
    >
      <Link
        href={`/designs/${design.id}`}
        className="text-[#124E66] hover:underline mt-auto"
      >
        <Image
          src={decodeURIComponent(
            design.externalImageUrl || "/placeholder.svg",
          )}
          alt={design.title}
          width={designCardWidth}
          height={designCardHeight}
          className={`w-full h-[${designCardWidth}px] object-cover`}
        />
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
