/**
 * The one error every missing store throws.
 *
 * The design's rule for the state layer is that a missing store fails loudly:
 * in CI, in a preview, in production, the first request that needs a store
 * whose variable is not set throws this, naming the variable, and nothing
 * degrades into a quieter, wronger version of itself. The single exception
 * is `lib/budget.ts` outside production, and that module says so.
 *
 * The message names the variable and never its value, because this error
 * ends up in function logs and in the odd test failure.
 */

export type StoreName = "redis" | "neon" | "blob";

export class StoreUnavailableError extends Error {
  readonly envVar: string;

  constructor(
    public readonly store: StoreName,
    envVar: string,
  ) {
    super(`The ${store} store is not configured: ${envVar} is not set. See .env.example.`);
    this.name = "StoreUnavailableError";
    this.envVar = envVar;
  }
}
