import { create } from "zustand";
import companyData from "@/config/config.json";

export interface SocialMedia {
  [key: string]: string;
}

export interface RepresentationProps {
  [key: string]: string;
}

export interface VerificationProps {
  [key: string]: string;
}

export interface AnalyticsProps {
  [key: string]: string;
}

export type ConfigValue = string | SocialMedia | Record<string, string>;

export interface CarouselSlide {
  image: string;
  title: string;
  description: string;
}

export interface AboutConfig {
  /** Story paragraphs. "{{name}}" is replaced with the site name at render time. */
  story: string[];
  approachIntro: string;
  approachPoints: string[];
  approachOutro: string;
}

export interface SiteConfig {
  name: string;
  intro: string;
  subtitle: string;
  tagline: string;
  description: string;
  keywords: string;
  domain: string;
  siteLogo: string;
  siteBanner: string;
  email: string;
  phone: string;
  address: string;
  policyUpdateDate: string;
  social: SocialMedia;
  representation: RepresentationProps;
  verification: VerificationProps;
  analytics: AnalyticsProps;
  favicon: string;
  themeLink: string;
  slides: CarouselSlide[];
  about: AboutConfig;
}

interface SiteConfigStore {
  config: SiteConfig;
  updateConfig: (newConfig: Partial<SiteConfig>) => void;
}

export const useSiteConfigStore = create<SiteConfigStore>((set) => ({
  config: {
    ...companyData,
  },
  updateConfig: (newConfig) =>
    set((state) => ({ config: { ...state.config, ...newConfig } })),
}));
