import { describe, expect, it } from "vitest";
import { toClientConfig } from "./client-config";
import baseConfig from "@/config/config.json";
import type { SiteConfig } from "@/lib/store";

const config = {
  ...baseConfig,
  name: "ThreadQuirk",
  siteLogo: "/logo.png",
  email: "hi@example.com",
  social: { twitter: "https://x.com/tq" },
  articles: { label: "Notes" },
  collectionPages: [{ collection: "A", title: "A", description: "d", intro: "i" }],
  giftPages: [{ slug: "g" }],
} as unknown as SiteConfig;

describe("toClientConfig", () => {
  it("keeps only what Header, ContactForm and SocialLinks read", () => {
    expect(toClientConfig(config)).toEqual({
      name: "ThreadQuirk",
      siteLogo: "/logo.png",
      email: "hi@example.com",
      social: { twitter: "https://x.com/tq" },
      articles: { label: "Notes" },
    });
  });

  it("leaves articles out when no label is configured", () => {
    expect(toClientConfig({ ...config, articles: undefined })).not.toHaveProperty("articles");
    expect(toClientConfig({ ...config, articles: {} })).not.toHaveProperty("articles");
  });

  it("does not ship the large page profiles to the client", () => {
    const json = JSON.stringify(toClientConfig(config));
    expect(json).not.toContain("collectionPages");
    expect(json).not.toContain("giftPages");
    expect(json).not.toContain("home");
  });
});
