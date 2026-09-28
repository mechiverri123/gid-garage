// Cloudflare Workers rejects native fetch called with any `this` other than
// the global ("Illegal invocation: function called with incorrect 'this'
// reference"). Storing fetch on an object and calling obj.fetch(...) does
// exactly that. Always pass fetch around through this wrapper, which calls
// it with the correct receiver no matter how the wrapper itself is invoked.

export const workerFetch = (...args) => globalThis.fetch(...args);

// Wrap any injected fetch (tests pass mocks) so it is also safe to store on an
// object and call as a method.
export const boundFetch = impl => (impl ? (...args) => impl(...args) : workerFetch);

// Per-invocation subrequest budget. Cloudflare Workers hard-fails a request
// after 50 subrequests (external APIs AND Supabase calls both count), so SEO
// sync meters every call and stops well short. `reserve` is opened only for
// the final bookkeeping writes. Worst case = total + reserve (see sync.js).
export class SubrequestBudgetExceeded extends Error {}

export function subrequestBudget({ external = 20, total = 40, reserve = 5 } = {}) {
  const used = { external: 0, total: 0 };
  let cap = total;
  const take = isExternal => {
    if (used.total >= cap || (isExternal && used.external >= external)) {
      throw new SubrequestBudgetExceeded(`subrequest budget reached (${used.external}/${external} external, ${used.total}/${cap} total)`);
    }
    used.total += 1;
    if (isExternal) used.external += 1;
  };
  return {
    used,
    limits: { external, total, reserve },
    // async so an exhausted budget is a rejected promise, like a failed fetch
    wrap: (fetchFn, isExternal) => async (...args) => { take(isExternal); return fetchFn(...args); },
    left: () => ({ external: external - used.external, total: cap - used.total }),
    openReserve: () => { cap = total + reserve; },
  };
}
