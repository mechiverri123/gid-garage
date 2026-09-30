// Types for site-pages.js (public service pages + service-area page).
export interface PriceItem { label: string; detail: string }
export interface Faq { q: string; a: string }
export interface ServicePageData {
  path: string; serviceId: string; label: string; title: string; description: string; canonical: string;
  h1: string; intro: string; pricing: PriceItem[]; included: string[]; photos: { src: string; alt: string }[];
  faq: Faq[]; howItWorks: { title: string; text: string }[];
}
export interface Area { name: string; slug: string; miles: number; blurb: string }
export interface SimplePage { path: string; canonical: string; title: string; description: string; h1: string; intro?: string; label?: string }
export const SITE: string;
export const PHONE: string;
export const SERVICE_PAGES: ServicePageData[];
export const AREAS: Area[];
export const AREAS_PAGE: SimplePage;
export const HOME_PAGE: SimplePage;
export const PRIVACY_PAGE: SimplePage;
export function pageForPath(path: string): ServicePageData | null;
export interface CaseStudy {
  slug: string; serviceId: string; month: string; vehicle: string; mileage: string | null; path: string; canonical: string;
  title: string; description: string; h1: string; complaint: string; diagnosis: string; repair: string; outcome: string; lesson: string;
  photos: { src: string; alt: string }[];
}
export const CASE_STUDIES: CaseStudy[];
export const CASE_STUDIES_PAGE: SimplePage;
export function caseStudyForPath(path: string): CaseStudy | null;
