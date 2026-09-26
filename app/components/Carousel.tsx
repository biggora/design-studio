"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Slider from "react-slick";
import Image from "next/image";
import { Pause, Play } from "lucide-react";

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
  carouselItems: {
    image: string;
    title: string;
    description: string;
  }[];
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

  return (
    <section className="relative w-full -mt-16">
      <Slider
        ref={sliderRef}
        {...{ ...defaultSettings, ...settings, autoplay }}
      >
        {carouselItems.map((item, index) => (
          <div key={index} className="relative h-[60vh]">
            <Image
              src={item.image}
              alt={item.title}
              fill
              priority={index === 0}
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
            </div>
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
