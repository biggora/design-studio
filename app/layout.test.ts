import { describe, expect, it, vi } from "vitest";
import baseConfig from "@/config/config.json";

const getSiteConfig = vi.fn();
vi.mock("next/font/google", () => ({ Inter: () => ({ className: "inter" }) }));
vi.mock("@/utils/database", () => ({ getSiteConfig: () => getSiteConfig() }));
vi.mock("./globals.css", () => ({}));
vi.mock("./components/Header", () => ({ default: () => null }));
vi.mock("./components/Footer", () => ({ default: () => null }));
vi.mock("./components/CookieBanner", () => ({ CookieBanner: () => null }));
vi.mock("./components/AnalyticsGate", () => ({ AnalyticsGate: () => null }));
vi.mock("@/app/components/JsonLd", () => ({ JsonLd: () => null }));
vi.mock("@/app/wrapper", () => ({ default: () => null }));

describe("root metadata", () => {
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
