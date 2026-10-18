import { create } from "zustand";
import companyData from "@/config/config.json";
import type {CollectionPage} from "@/lib/collections";
import type {GiftPage} from "@/lib/gifts";

export interface SocialMedia {
  [key: string]: string;
}

export interface RepresentationProps {
  [key: string]: string;
}

export interface VerificationProps {
  [key: string]: string;
}

export interface AffiliateProps {
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
  /** Call-to-action chip on the slide; defaults filled in by the home page. */
  ctaLabel?: string;
  ctaHref?: string;
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
  affiliate: AffiliateProps;
  analytics: AnalyticsProps;
  favicon: string;
  themeLink: string;
  slides: CarouselSlide[];
  about: AboutConfig;
  /** Promoted collection pages, optionally JSON-encoded in the studio table. */
  collectionPages?: CollectionPage[] | string;
  /** Curated gift landing pages (/gifts/<slug>), optionally JSON-encoded in the studio table. */
  giftPages?: GiftPage[] | string;
  /** Home discovery copy; studio rows can override any field below. */
  home?: HomeConfig;
}

export interface HomeValue {
  title: string;
  description: string;
}

export interface HomeConfig {
  title: string;
  heading: string;
  description: string;
  /** Ember eyebrow label above the hero H1; hidden when empty. */
  eyebrow?: string;
  /** Accent-colored word appended to the hero H1. Unset: the heading's last
      word takes the accent automatically; empty string disables the accent. */
  headingAccent?: string;
  /** Caption strip inside the framed hero artwork card. */
  heroCaption?: string;
  /** Philosophy band; the section hides when values is empty. */
  valuesEyebrow?: string;
  valuesTitle?: string;
  valuesIntro?: string;
  values?: HomeValue[] | string;
  /** About teaser; the section hides when both strings are empty. */
  aboutEyebrow?: string;
  aboutTitle?: string;
  aboutText?: string;
  aboutPoints?: HomeValue[] | string;
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
