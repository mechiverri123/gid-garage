// Cloudflare Workers rejects native fetch called with any `this` other than
// the global ("Illegal invocation: function called with incorrect 'this'
// reference"). Storing fetch on an object and calling obj.fetch(...) does
// exactly that. Always pass fetch around through this wrapper, which calls
// it with the correct receiver no matter how the wrapper itself is invoked.

export const workerFetch = (...args) => globalThis.fetch(...args);

// Wrap any injected fetch (tests pass mocks) so it is also safe to store on an
// object and call as a method.
export const boundFetch = impl => (impl ? (...args) => impl(...args) : workerFetch);
