import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalyticsGate } from "./AnalyticsGate";

const consent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/consent", () => ({ useCookieConsent: consent }));
vi.mock("@next/third-parties/google", () => ({
  GoogleAnalytics: () => <span>analytics loaded</span>,
}));

function renderAt(hostname: string, domain = "prints.example.test") {
  vi.stubGlobal("window", { location: { hostname } });
  return renderToStaticMarkup(<AnalyticsGate gaId="G-TEST" domain={domain} />);
}

beforeEach(() => consent.mockReturnValue("accepted"));
afterEach(() => vi.unstubAllGlobals());

describe("analytics deployment isolation", () => {
  it.each(["prints.example.test", "www.prints.example.test"])(
    "loads on the configured site %s after consent",
    (hostname) => expect(renderAt(hostname)).toContain("analytics loaded"),
  );

  it.each([
    "localhost", "127.0.0.1", "preview.example.test",
    "prints.example.test.attacker.test", "shop.prints.example.test",
  ])("does not load on %s with the production config", (hostname) => {
    expect(renderAt(hostname)).toBe("");
  });

  it("follows another deployment's configured domain, including www", () => {
    expect(renderAt("other.example.test", "www.other.example.test"))
      .toContain("analytics loaded");
    expect(renderAt("prints.example.test", "other.example.test")).toBe("");
  });

  it.each(["unset", "declined"])("requires consent (%s)", (choice) => {
    consent.mockReturnValue(choice);
    expect(renderAt("prints.example.test")).toBe("");
  });

  it("does not access browser APIs during server rendering", () => {
    vi.stubGlobal("window", undefined);
    expect(renderToStaticMarkup(
      <AnalyticsGate gaId="G-TEST" domain="prints.example.test" />,
    )).toBe("");
  });
});
