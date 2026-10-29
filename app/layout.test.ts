import { describe, expect, it, vi } from "vitest";
import baseConfig from "@/config/config.json";

const getSiteConfig = vi.fn();
vi.mock("next/font/google", () => ({
  Inter: () => ({ className: "inter", variable: "--font-sans" }),
  Poppins: () => ({ className: "poppins", variable: "--font-display" }),
}));
vi.mock("@/utils/database", () => ({ getSiteConfig: () => getSiteConfig() }));
vi.mock("./globals.css", () => ({}));
vi.mock("./components/Header", () => ({ default: () => null }));
vi.mock("./components/Footer", () => ({ default: () => null }));
vi.mock("./components/CookieBanner", () => ({ CookieBanner: () => null }));
vi.mock("./components/AnalyticsGate", () => ({ AnalyticsGate: () => null }));
vi.mock("@/app/components/JsonLd", () => ({ JsonLd: () => null }));
import { JsonLd } from "@/app/components/JsonLd";
vi.mock("@/app/wrapper", () => ({ default: () => null }));

function findJsonLdData(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(findJsonLdData).find(Boolean);
  if (!node || typeof node !== "object") return undefined;
  const el = node as { type?: unknown; props?: { data?: unknown; children?: unknown } };
  if (el.type === JsonLd) return el.props?.data;
  return findJsonLdData(el.props?.children);
}

describe("root JSON-LD", () => {
  it("shares stable organization and website identities without losing company details", async () => {
    const { default: RootLayout } = await import("./layout");
    getSiteConfig.mockResolvedValue({
      ...baseConfig, name: "Other Studio", domain: "other.example.test", siteLogo: "/logo.svg",
      social: { pinterest: "https://www.pinterest.com/other", shop: "https://www.redbubble.com/people/other/shop" },
      representation: {
        redbuble: "https://www.redbubble.com/people/other/shop",
        teepublic: "https://www.teepublic.com/user/other",
        tostadora: "https://www.tostadora.co.uk/shop/other",
        zazzle: "https://www.zazzle.com/store/other",
      },
      affiliate: { redbubbleTemplate: "https://example.test/redirect?u={url}", teepublicReferralId: "123" },
    });
    const data = findJsonLdData(await RootLayout({ children: null })) as Record<string, unknown>[];
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      "@type": "Organization", "@id": "https://other.example.test/#organization",
      name: "Other Studio", logo: "https://other.example.test/logo.svg",
      url: "https://other.example.test", description: baseConfig.description,
    });
    expect(data[1]).toMatchObject({
      "@type": "WebSite", "@id": "https://other.example.test/#website",
      publisher: { "@id": data[0]["@id"] }, inLanguage: "en",
    });
    expect(data[0]).not.toHaveProperty("address");
    expect(data[0].sameAs).toEqual([
      "https://www.pinterest.com/other",
      "https://www.redbubble.com/people/other/shop",
      "https://www.teepublic.com/user/other",
      "https://www.tostadora.co.uk/shop/other",
      "https://www.zazzle.com/store/other",
    ]);
  });
  it("declares a WebSite SearchAction for the catalog search", async () => {
    const { default: RootLayout } = await import("./layout");
    getSiteConfig.mockResolvedValue({ ...baseConfig, name: "Other Studio", domain: "other.example.test" });
    const data = findJsonLdData(await RootLayout({ children: null })) as Record<string, unknown>[];
    expect(data.find((item) => item["@type"] === "WebSite")).toMatchObject({
      url: "https://other.example.test",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: "https://other.example.test/designs?search={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
    });
  });
  it("uses the footer's legacy Tostadora setting and omits empty sameAs", async () => {
    const { default: RootLayout } = await import("./layout");
    getSiteConfig.mockResolvedValue({ ...baseConfig, social: {}, representation: { tostaDora: "https://www.tostadora.com/shop/other" } });
    const legacy = findJsonLdData(await RootLayout({ children: null })) as Record<string, unknown>[];
    expect(legacy[0].sameAs).toEqual(["https://www.tostadora.com/shop/other"]);
    getSiteConfig.mockResolvedValue({ ...baseConfig, social: {}, representation: {} });
    const empty = findJsonLdData(await RootLayout({ children: null })) as Record<string, unknown>[];
    expect(empty[0]).not.toHaveProperty("sameAs");
  });
});

describe("root metadata", () => {
  it("uses the deployment's configured domain and brand", async () => {
    const { generateMetadata } = await import("./layout");
    getSiteConfig.mockResolvedValue({
      ...baseConfig,
      name: "Other Studio",
      domain: "other.example.test",
    });
    const metadata = await generateMetadata();
    expect(metadata.metadataBase?.toString()).toBe("https://other.example.test/");
    expect(metadata.applicationName).toBe("Other Studio");
  });

  it("emits the Pinterest p:domain_verify tag only when configured", async () => {
    const { generateMetadata } = await import("./layout");
    getSiteConfig.mockResolvedValue({
      ...baseConfig,
      verification: { ...baseConfig.verification, pinterest: "1dcacb7952a8ea373524e2c90ad901a8" },
    });
    expect((await generateMetadata()).verification?.other).toEqual({
      "p:domain_verify": "1dcacb7952a8ea373524e2c90ad901a8",
    });
    getSiteConfig.mockResolvedValue({ ...baseConfig });
    expect((await generateMetadata()).verification).toBeUndefined();
  });
});
