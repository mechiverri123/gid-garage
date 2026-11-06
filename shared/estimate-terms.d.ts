export const ESTIMATE_TERMS_CORE: string[];
export const ESTIMATE_TERMS_EXTENDED: string[];
export function estimateTermsFor(job: { customerAgreed?: boolean; signedAt?: string | null } | null | undefined): { core: string[]; extended: string[]; all: string[] };
