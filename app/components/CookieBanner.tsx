"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export function CookieBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const cookiesAccepted = localStorage.getItem("cookiesAccepted");
    if (cookiesAccepted !== "true") {
      setShowBanner(true);
    }
  }, []);

  const acceptCookies = () => {
    localStorage.setItem("cookiesAccepted", "true");
    setShowBanner(false);
  };

  if (!showBanner) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#212A31] text-[#D3D9D4] p-4 shadow-lg">
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between">
        <p className="text-sm mb-4 sm:mb-0">
          We use cookies to enhance your experience. By continuing to visit this
          site you agree to our use of cookies.{" "}
          <Link
            href="/privacy-policy"
            className="underline hover:text-[#748D92]"
          >
            Learn more
          </Link>
        </p>
        <button
          onClick={acceptCookies}
          className="bg-[#124E66] text-[#D3D9D4] px-4 py-2 rounded-md hover:bg-[#2E3944] transition-colors"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
