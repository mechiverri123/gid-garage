// Screen labels for the visible job cards ("open the brake one", "the newest").
// Kept apart from jobStore so the page can read it without loading JobOps.
export const jobMeta = new Map<string, { label: string; date: string }>();

// Revenue data Jarvis already computed for its answer (the `ui` event's data),
// keyed by "from|to", so the chart it just talked about renders instantly.
export const revenuePrefetch = new Map<string, unknown>();
