import { create } from "zustand";
import companyData from "@/config/company.json";

interface SiteConfig {
  name: string;
  intro: string;
  description: string;
  keywords: string;
  domain: string;
  email: string;
  phone: string;
  address: string;
  policyUpdateDate: string;
  social: {
    pinterest: string;
    twitter: string;
    facebook: string;
    instagram: string;
    linkedin: string;
    youtube: string;
  };
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
