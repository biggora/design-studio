import { create } from "zustand";
import companyData from "@/config/config.json";

export interface SocialMedia {
  [key: string]: string;
}

export type ConfigValue = string & SocialMedia;

export interface SiteConfig {
  name: string;
  intro: string;
  description: string;
  keywords: string;
  domain: string;
  email: string;
  phone: string;
  address: string;
  policyUpdateDate: string;
  social: SocialMedia;
}

interface SiteConfigStore {
  config: SiteConfig;
  updateConfig: (newConfig: Partial<SiteConfig>) => void;
}

export const useSiteConfigStore = create<SiteConfigStore>((set) => ({
  config: companyData,
  updateConfig: (newConfig) =>
    set((state) => ({ config: { ...state.config, ...newConfig } })),
}));
