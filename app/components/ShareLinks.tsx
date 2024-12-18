import { SiFacebook, SiPinterest, SiX } from "@icons-pack/react-simple-icons";

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
      <span className="text-[#212A31] font-semibold">Share:</span>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#124E66] hover:text-[#2E3944] transition-colors"
        aria-label="Share on Facebook"
      >
        <SiFacebook size={24} />
      </a>
      <a
        href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#124E66] hover:text-[#2E3944] transition-colors"
        aria-label="Share on Twitter"
      >
        <SiX size={24} />
      </a>
      <a
        href={`https://pinterest.com/pin/create/button/?url=${encodeURIComponent(shareUrl)}&media=${encodeURIComponent(imageUrl)}&description=${encodeURIComponent(shareText)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#124E66] hover:text-[#2E3944] transition-colors"
        aria-label="Share on Pinterest"
      >
        <SiPinterest size={24} />
      </a>
    </>
  );
}
