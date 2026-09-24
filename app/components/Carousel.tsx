"use client";

import { useEffect, useRef, useState } from "react";
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
  // Hydration-safe: initial state matches the server; prefers-reduced-motion
  // (and live changes to it) pause autoplay right after mount.
  const [autoplay, setAutoplay] = useState(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) {
      setAutoplay(false);
      sliderRef.current?.slickPause();
    }
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setAutoplay(false);
        sliderRef.current?.slickPause();
      }
    };
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  const toggleAutoplay = () => {
    if (autoplay) {
      sliderRef.current?.slickPause();
      setAutoplay(false);
    } else {
      sliderRef.current?.slickPlay();
      setAutoplay(true);
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
              <p className="text-3xl md:text-5xl font-bold mb-4 text-primary-foreground">
                {item.title}
              </p>
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
