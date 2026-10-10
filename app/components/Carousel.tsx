"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import Slider from "react-slick";
import Image from "next/image";
import { ArrowRight, Pause, Play } from "lucide-react";
import { CarouselSlide } from "@/lib/store";

const defaultSettings = {
  dots: true,
  infinite: true,
  speed: 500,
  slidesToShow: 1,
  slidesToScroll: 1,
  autoplay: true,
  autoplaySpeed: 5000,
};

function subscribeToReducedMotion(onChange: () => void): () => void {
  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

type CarouselProps = {
  carouselItems: CarouselSlide[];
  settings?: typeof defaultSettings;
};

export function Carousel({
  carouselItems,
  settings = defaultSettings,
}: CarouselProps) {
  const sliderRef = useRef<Slider>(null);
  // Hydration-safe: the server snapshot is false, so the first client render
  // matches it; the stored OS preference takes over right after mount.
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
  const [userPaused, setUserPaused] = useState(false);
  const autoplay = !userPaused && !prefersReducedMotion;

  // Sync the external slider with the resolved autoplay state (covers the
  // reduced-motion preference flipping on mid-session).
  useEffect(() => {
    if (!autoplay) sliderRef.current?.slickPause();
  }, [autoplay]);

  const toggleAutoplay = () => {
    if (autoplay) {
      sliderRef.current?.slickPause();
      setUserPaused(true);
    } else {
      sliderRef.current?.slickPlay();
      setUserPaused(false);
    }
  };

  // The whole slide is a link; a swipe must not navigate. Browsers may still
  // deliver a click after slick's drag handling, so a horizontal move larger
  // than a tap cancels it.
  const dragStartX = useRef<number | null>(null);
  const onSlidePointerDown = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    dragStartX.current = event.clientX;
  };
  const onSlideClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    const startX = dragStartX.current;
    dragStartX.current = null;
    if (startX !== null && Math.abs(event.clientX - startX) > 10) {
      event.preventDefault();
    }
  };

  return (
    <section className="relative w-full">
      <Slider
        ref={sliderRef}
        {...{ ...defaultSettings, ...settings, autoplay }}
      >
        {carouselItems.map((item, index) => (
          <div key={index} className="relative h-[60vh]">
            <Link
              href={item.ctaHref ?? "/designs"}
              aria-label={item.ctaLabel ?? "Browse designs"}
              onPointerDown={onSlidePointerDown}
              onClick={onSlideClick}
              className="group absolute inset-0 block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <Image
                src={item.image}
                alt={item.title}
                fill
                sizes="100vw"
                style={{ objectFit: "cover" }}
              />
              <div className="absolute inset-0 bg-primary/60 flex flex-col justify-center items-center text-center p-4">
                <h2 className="text-3xl md:text-5xl font-bold mb-4 text-primary-foreground">
                  {item.title}
                </h2>
                <p className="text-xl md:text-2xl text-primary-foreground/95">
                  {item.description}
                </p>
                <span
                  className="mt-6 inline-flex items-center gap-2 rounded-md bg-background px-6 py-2 text-base font-medium text-foreground transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
                >
                  {item.ctaLabel ?? "Browse designs"}
                  <ArrowRight size={18} aria-hidden="true" />
                </span>
              </div>
            </Link>
          </div>
        ))}
      </Slider>
      <button
        type="button"
        onClick={toggleAutoplay}
        aria-label={autoplay ? "Pause carousel" : "Play carousel"}
        aria-pressed={!autoplay}
        className="absolute right-4 bottom-14 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary/60 text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {autoplay ? <Pause size={20} /> : <Play size={20} />}
      </button>
    </section>
  );
}
