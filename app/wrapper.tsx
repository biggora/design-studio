"use client";

import { createContext } from "react";
import type { ClientConfig } from "@/lib/client-config";

export const ConfigContext = createContext<ClientConfig>({} as ClientConfig);

const ContextWrapper = ({
  config,
  children,
}: {
  config: ClientConfig;
  children: React.ReactNode;
}) => {
  return (
    <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>
  );
};

export default ContextWrapper;
