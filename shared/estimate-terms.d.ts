export const ESTIMATE_TERMS_CORE: string[];
export const ESTIMATE_TERMS_EXTENDED: string[];
export const PPI_TERMS: string[];
export function estimateTermsFor(job: { customerAgreed?: boolean; signedAt?: string | null; service?: string } | null | undefined): { core: string[]; extended: string[]; all: string[] };
