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
// palette in app/globals.css / DESIGN.md (the same exception as `themeColor`).
const INK = "#212A31"; // Loom Ink
const ACCENT = "#124E66"; // Indigo Thread, the single interactive hue
const MUTED = "#748D92"; // Warp Grey
const MIST = "#D3D9D4"; // Linen Mist
const WHITE = "#FFFFFF"; // Card White
const MUTED_TEXT = "#4F5F66"; // Warp Grey darkened to keep body text readable on white

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

/** Inter Regular/Bold from the committed .woff files (satori cannot read woff2). Memoized. */
export function loadOgFonts(): Promise<OgFont[]> {
  fontsPromise ??= Promise.all([
    readFile(join(FONT_DIR, "Inter-Regular.woff")),
    readFile(join(FONT_DIR, "Inter-Bold.woff")),
  ])
    .then(([regular, bold]): OgFont[] => [
      { name: "Inter", data: regular, weight: 400, style: "normal" },
      { name: "Inter", data: bold, weight: 700, style: "normal" },
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
 * on any failure (blocked host, slow CDN, non-image, webp — satori cannot
 * decode it). Never throws, so a bad mockup degrades the card, not the route.
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
    <div style={{ display: "flex", alignItems: "center", fontSize: 28, fontWeight: 700, color: ACCENT, letterSpacing: -0.5 }}>
      {logoDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img>; next/image does not apply
        <img src={logoDataUrl} alt="" width={48} height={48} style={{ borderRadius: 10, marginRight: 14 }} />
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
        borderRadius: 999,
        backgroundColor: MIST,
        color: INK,
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
        borderRadius: 999,
        backgroundColor: ACCENT,
        color: WHITE,
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

/** Right panel: tinted background, two soft circles, and a rounded white card around `children`. */
function VisualPanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: 528,
        height: "100%",
        backgroundColor: "#E9ECE9",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <Circle size={320} top={-90} left={290} color={MIST} opacity={0.9} />
      <Circle size={240} top={430} left={-60} color={ACCENT} opacity={0.12} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 340,
          height: 452,
          borderRadius: 24,
          backgroundColor: WHITE,
          boxShadow: "0 20px 50px rgba(33, 42, 49, 0.18)",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Right panel showing the site logo (or the site-name initial when it is unavailable) in the white card; used by BrandCard and as DesignCard's no-image fallback. */
function InitialPanel({ siteName, logoDataUrl }: { siteName: string; logoDataUrl: string | null }) {
  const initial = Array.from(siteName.trim())[0]?.toUpperCase() ?? "";
  return (
    <VisualPanel>
      {logoDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img>; next/image does not apply
        <img src={logoDataUrl} alt="" width={300} height={300} style={{ borderRadius: 16 }} />
      ) : (
        <div style={{ display: "flex", fontSize: 180, fontWeight: 700, color: ACCENT }}>{initial}</div>
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
        backgroundColor: WHITE,
        fontFamily: "Inter",
      }}
    >
      <div style={{ display: "flex", width: "100%", height: 10, backgroundColor: ACCENT }} />
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
            color: INK,
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
            color: MUTED_TEXT,
            lineClamp: 3,
          }}
        >
          {truncateAtWord(description, MAX_DESCRIPTION)}
        </div>
        <div style={{ display: "flex", marginTop: 30 }}>
          <Button label={cta} />
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 20, color: MUTED }}>{domain}</div>
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
            alt=""
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
