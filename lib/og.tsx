import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isAllowedPinSourceImage } from "@/lib/pin-image";
import { truncateAtWord } from "@/lib/utils";

/**
 * Social card (OpenGraph / Twitter) rendering shared by the
 * `opengraph-image` / `twitter-image` routes. Layout goes through satori
 * (`next/og`), which supports only a flexbox subset: every element with more
 * than one child needs `display: flex`, and CSS variables are unavailable.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;

// Literal hex on purpose: satori cannot read CSS variables. These mirror the
// Ember on Graphite token block in app/globals.css / DESIGN.md (the same
// sanctioned exception as `themeColor`) — re-sync them when the tokens change.
const FIELD = "#181C20"; // Graphite field (hsl(210 15% 11%)) — the card background
const SURFACE = "#1C2126"; // Slate Band (hsl(210 15% 13%)) — the visual panel
const PANEL = "#272D35"; // Panel (hsl(212 15% 18%)) — framed tile, chip surface
const SEAM = "#323B43"; // Seam (hsl(210 14% 23%)) — hairline borders
const BONE = "#F4F5F6"; // Bone (hsl(200 12% 96%)) — headings and body text
const ASH = "#99A5AD"; // Ash (hsl(204 11% 64%)) — secondary text
const EMBER = "#E8872C"; // Ember (hsl(29 80% 54%)) — the single interactive hue
const EMBER_ASH = "#221607"; // Ember Ash (hsl(33 68% 8%)) — dark text on Ember

const MAX_DESCRIPTION = 140;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FONT_DIR = join(process.cwd(), "assets", "fonts");
const DATA_URL_TYPES = ["image/png", "image/jpeg", "image/gif"];

export type OgFont = {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: "normal";
};

let fontsPromise: Promise<OgFont[]> | undefined;

/** Inter Regular/Bold and Poppins Bold from the committed .woff files (satori cannot read woff2). Memoized. */
export function loadOgFonts(): Promise<OgFont[]> {
  fontsPromise ??= Promise.all([
    readFile(join(FONT_DIR, "Inter-Regular.woff")),
    readFile(join(FONT_DIR, "Inter-Bold.woff")),
    readFile(join(FONT_DIR, "Poppins-Bold.woff")),
  ])
    .then(([interRegular, interBold, poppinsBold]): OgFont[] => [
      { name: "Inter", data: interRegular, weight: 400, style: "normal" },
      { name: "Inter", data: interBold, weight: 700, style: "normal" },
      { name: "Poppins", data: poppinsBold, weight: 700, style: "normal" },
    ])
    .catch((error) => {
      fontsPromise = undefined; // do not cache a failure
      throw error;
    });
  return fontsPromise;
}

// 600×600 copy of public/logo.png (the card draws it at most 300px); regenerate it when the logo changes.
const LOGO_PATH = join(process.cwd(), "assets", "logo-og.png");
let logoPromise: Promise<string | null> | undefined;

/** Site logo (assets/logo-og.png) as a data: URL, or null when missing/unreadable. Memoized; never throws. */
export function loadOgLogo(path: string = LOGO_PATH): Promise<string | null> {
  const load = () =>
    readFile(path)
      .then((bytes) => `data:image/png;base64,${bytes.toString("base64")}`)
      .catch(() => null);
  if (path !== LOGO_PATH) return load();
  logoPromise ??= load();
  return logoPromise;
}

/**
 * Fetches a design image server-side and returns it as a `data:` URL, or null
 * on any failure (blocked host — the Redbubble allowlist plus the site's own
 * image CDN, slow CDN, non-image, webp — satori cannot decode it, which is why
 * CDN designs pass their pre-flattened share JPEG). Never throws, so a bad
 * source degrades the card, not the route.
 */
export async function fetchImageDataUrl(url: string, timeoutMs = 4000): Promise<string | null> {
  try {
    if (!isAllowedPinSourceImage(url)) return null;
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!DATA_URL_TYPES.includes(type)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

function Wordmark({ siteName, logoDataUrl }: { siteName: string; logoDataUrl: string | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", fontSize: 28, fontWeight: 700, color: BONE, letterSpacing: -0.5, fontFamily: "Poppins" }}>
      {logoDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img>; next/image does not apply
        <img src={logoDataUrl} alt={`${siteName} logo`} width={48} height={48} style={{ borderRadius: 10, marginRight: 14 }} />
      )}
      {siteName}
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "6px 16px",
        borderRadius: 10,
        backgroundColor: PANEL,
        border: `1px solid ${SEAM}`,
        color: EMBER,
        fontSize: 20,
        fontWeight: 700,
      }}
    >
      {label}
    </div>
  );
}

function Button({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "16px 40px",
        borderRadius: 10,
        backgroundColor: EMBER,
        color: EMBER_ASH,
        fontSize: 26,
        fontWeight: 700,
      }}
    >
      {label}
    </div>
  );
}

function Circle({ size, top, left, color, opacity }: { size: number; top: number; left: number; color: string; opacity: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top,
        left,
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: color,
        opacity,
      }}
    />
  );
}

/** Right panel: tinted background, two soft circles, and a framed tile around `children`. */
function VisualPanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: 528,
        height: "100%",
        backgroundColor: SURFACE,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <Circle size={320} top={-90} left={290} color={PANEL} opacity={0.9} />
      <Circle size={240} top={430} left={-60} color={EMBER} opacity={0.08} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 340,
          height: 452,
          borderRadius: 12,
          backgroundColor: PANEL,
          border: `1px solid ${SEAM}`,
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.4)",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Right panel showing the site logo (or the site-name initial when it is unavailable) in the framed tile; used by BrandCard and as DesignCard's no-image fallback. */
function InitialPanel({ siteName, logoDataUrl }: { siteName: string; logoDataUrl: string | null }) {
  const initial = Array.from(siteName.trim())[0]?.toUpperCase() ?? "";
  return (
    <VisualPanel>
      {logoDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img>; next/image does not apply
        <img src={logoDataUrl} alt={`${siteName} logo`} width={300} height={300} style={{ borderRadius: 16 }} />
      ) : (
        <div style={{ display: "flex", fontSize: 180, fontWeight: 700, color: EMBER, fontFamily: "Poppins" }}>{initial}</div>
      )}
    </VisualPanel>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: FIELD,
        fontFamily: "Inter",
      }}
    >
      <div style={{ display: "flex", width: "100%", height: 10, backgroundColor: EMBER }} />
      <div style={{ display: "flex", flex: 1 }}>{children}</div>
    </div>
  );
}

function Copy({
  siteName,
  logoDataUrl,
  domain,
  label,
  title,
  description,
  cta,
}: {
  siteName: string;
  logoDataUrl: string | null;
  domain: string;
  label: string;
  title: string;
  description: string;
  cta: string;
}) {
  const titleSize = title.length > 60 ? 46 : title.length > 36 ? 54 : 62;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        flex: 1,
        padding: "48px 56px 40px 64px",
      }}
    >
      <Wordmark siteName={siteName} logoDataUrl={logoDataUrl} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <Chip label={label} />
        <div
          style={{
            display: "block",
            marginTop: 22,
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: -1.5,
            color: BONE,
            fontFamily: "Poppins",
            lineClamp: 3,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "block",
            marginTop: 20,
            fontSize: 24,
            lineHeight: 1.4,
            color: ASH,
            lineClamp: 3,
          }}
        >
          {truncateAtWord(description, MAX_DESCRIPTION)}
        </div>
        <div style={{ display: "flex", marginTop: 30 }}>
          <Button label={cta} />
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 20, color: ASH }}>{domain}</div>
    </div>
  );
}

export type DesignCardProps = {
  title: string;
  description: string;
  siteName: string;
  domain: string;
  label: string;
  /** `data:` URL from fetchImageDataUrl; null shows the site-initial fallback card instead. */
  imageDataUrl: string | null;
  /** From loadOgLogo; null falls back to no wordmark logo and the initial letter. */
  logoDataUrl?: string | null;
};

export function DesignCard({ title, description, siteName, domain, label, imageDataUrl, logoDataUrl = null }: DesignCardProps) {
  return (
    <Frame>
      <Copy
        siteName={siteName}
        logoDataUrl={logoDataUrl}
        domain={domain}
        label={label}
        title={title}
        description={description}
        cta="Shop now"
      />
      {imageDataUrl ? (
        <VisualPanel>
          {/* eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img>; next/image does not apply */}
          <img
            src={imageDataUrl}
            alt={title}
            width={300}
            height={412}
            style={{ objectFit: "contain" }}
          />
        </VisualPanel>
      ) : (
        <InitialPanel siteName={siteName} logoDataUrl={logoDataUrl} />
      )}
    </Frame>
  );
}

export type BrandCardProps = {
  siteName: string;
  intro: string;
  description: string;
  domain: string;
  logoDataUrl?: string | null;
};

export function BrandCard({ siteName, intro, description, domain, logoDataUrl = null }: BrandCardProps) {
  return (
    <Frame>
      <Copy
        siteName={siteName}
        logoDataUrl={logoDataUrl}
        domain={domain}
        label="Original designs"
        title={intro}
        description={description}
        cta="Browse designs"
      />
      <InitialPanel siteName={siteName} logoDataUrl={logoDataUrl} />
    </Frame>
  );
}
