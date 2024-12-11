"use client";

import { createContext } from "react";
import { SiteConfig } from "@/lib/store";

export const ConfigContext = createContext<SiteConfig>({} as SiteConfig);

const ContextWrapper = ({
  config,
  children,
}: {
  config: SiteConfig;
  children: React.ReactNode;
}) => {
  return (
    <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>
  );
};

export default ContextWrapper;
