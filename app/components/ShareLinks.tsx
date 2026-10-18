import { SiFacebook, SiPinterest, SiX } from "@icons-pack/react-simple-icons";
import { IconLink } from "@/app/components/IconLink";

type ShareLinksProps = {
  shareUrl: string;
  shareText: string;
  imageUrl: string;
};

export default function ShareLinks({
  shareUrl,
  shareText,
  imageUrl,
}: ShareLinksProps) {
  return (
    <>
      <span className="text-foreground font-semibold">Share:</span>
      <IconLink
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
        label="Share on Facebook"
      >
        <SiFacebook size={24} />
      </IconLink>
      <IconLink
        href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`}
        label="Share on X"
      >
        <SiX size={24} />
      </IconLink>
      <IconLink
        href={`https://pinterest.com/pin/create/button/?url=${encodeURIComponent(shareUrl)}&media=${encodeURIComponent(imageUrl)}&description=${encodeURIComponent(shareText)}`}
        label="Share on Pinterest"
      >
        <SiPinterest size={24} />
      </IconLink>
    </>
  );
}
