/** Bound only request reception. Long-running command responses have their own
 * timeout and must not be cut off because a shell produces no output. */
export const HTTP_RECEIVE_LIMITS = {
    headersTimeout: 10_000,
    requestTimeout: 15_000,
    connectionsCheckingInterval: 1_000
};
