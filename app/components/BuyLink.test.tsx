import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  AnchorHTMLAttributes,
  MouseEvent,
  ReactElement,
  ReactNode,
} from "react";
import { sendGAEvent } from "@next/third-parties/google";
import BuyLink, { BuyLinkProps } from "@/app/components/BuyLink";

vi.mock("@next/third-parties/google", () => ({
  sendGAEvent: vi.fn(),
}));

const sendEvent = vi.mocked(sendGAEvent);

const anchorProps = {
  href: "https://www.redbubble.com/shop/ap/184507566",
  platform: "redbubble",
  designSlug: "look-past-the-stars-astronaut-design",
  pageType: "design",
  position: "primary",
  className: "btn w-full gap-2",
} satisfies Omit<BuyLinkProps, "children">;

type AnchorElement = ReactElement<
  AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode }
>;

// The handler is the only behaviour added to the plain <a>, so the click is
// driven straight through the rendered element's onClick (no DOM in this env).
function click(element: AnchorElement, preventDefault = () => {}): void {
  element.props.onClick?.({ preventDefault } as MouseEvent<HTMLAnchorElement>);
}

beforeEach(() => {
  sendEvent.mockReset();
});

describe("BuyLink", () => {
  it("renders the same anchor markup as the plain <a> it replaces", () => {
    const html = renderToStaticMarkup(
      <BuyLink {...anchorProps}>
        Buy on Redbubble
        <span aria-hidden="true">&#8599;</span>
      </BuyLink>,
    );
    expect(html).toBe(
      '<a href="https://www.redbubble.com/shop/ap/184507566" target="_blank" rel="sponsored noopener noreferrer" class="btn w-full gap-2">Buy on Redbubble<span aria-hidden="true">↗</span></a>',
    );
  });

  it("sends buy_click with the platform, slug, page type and position", () => {
    const primary = BuyLink(anchorProps) as AnchorElement;
    click(primary);
    expect(sendEvent).toHaveBeenCalledTimes(1);
    expect(sendEvent).toHaveBeenCalledWith("event", "buy_click", {
      platform: "redbubble",
      design_slug: "look-past-the-stars-astronaut-design",
      page_type: "design",
      position: "primary",
    });

    sendEvent.mockReset();
    const secondary = BuyLink({
      ...anchorProps,
      href: "https://www.teepublic.com/t-shirt/99914330-look-past-the-stars?ref_id=ref-123",
      platform: "teepublic",
      pageType: "landing",
      position: "secondary",
    }) as AnchorElement;
    click(secondary);
    expect(sendEvent).toHaveBeenCalledWith("event", "buy_click", {
      platform: "teepublic",
      design_slug: "look-past-the-stars-astronaut-design",
      page_type: "landing",
      position: "secondary",
    });
  });

  it("never touches navigation: the click's default is left alone", () => {
    const element = BuyLink(anchorProps) as AnchorElement;
    const preventDefault = vi.fn();
    click(element, preventDefault);
    expect(sendEvent).toHaveBeenCalledTimes(1);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("does not throw when GA itself throws (no consent, ad blocker)", () => {
    sendEvent.mockImplementation(() => {
      throw new Error("dataLayer is unavailable");
    });
    const element = BuyLink(anchorProps) as AnchorElement;
    expect(() => click(element)).not.toThrow();
  });
});
