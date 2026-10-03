export interface TokenSet {
  token: string
  /** Expiry of `token` in ms since epoch. */
  expiresAt: number
}

/**
 * Exchanges a token for a new one at the API. Resolves `null` when the API rejects the token
 * (401: expired refresh window or revoked), and rejects on anything else (network, 5xx), so a
 * transient failure never signs the user out.
 */
export type RefreshTokenAtApi = (token: string) => Promise<TokenSet | null>

/**
 * Makes sure each token is refreshed at most once.
 *
 * Refreshing deny-lists the old token at the API, so concurrent requests carrying the same token
 * must share a single refresh. Requests that arrive shortly after a refresh, still carrying the old
 * token (the browser had not yet received the new session cookie, or an SSR render forwarded the
 * original cookie), reuse its result instead of refreshing a token the API has already denied.
 *
 * State is per process. Running more than one Nitro instance needs shared storage (see PLAN.md).
 */
export class RefreshCoordinator {
  private readonly refreshes = new Map<
    string,
    { result: Promise<TokenSet | null>; keepUntil: number }
  >()

  constructor(
    /** How long a finished refresh's result is reused for its old token. */
    private readonly reuseForMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Whether `token` was refreshed recently, so it must not be sent to the API any more. */
  wasRefreshed(token: string): boolean {
    this.prune()

    return this.refreshes.has(token)
  }

  /**
   * The newest token that `token` was refreshed to by other requests, following up to `maxHops`
   * refreshes in a row, and waiting for one still in flight; `null` when it wasn't refreshed (or
   * the refresh was refused or failed). Never refreshes.
   */
  async refreshedTo(token: string, maxHops = 3): Promise<TokenSet | null> {
    let latest: TokenSet | null = null

    for (let hop = 0; hop < maxHops; hop++) {
      this.prune()

      const entry = this.refreshes.get(latest?.token ?? token)
      const next = entry ? await entry.result.catch(() => null) : null

      if (!next) break

      latest = next
    }

    return latest
  }

  refresh(token: string, refreshAtApi: RefreshTokenAtApi): Promise<TokenSet | null> {
    this.prune()

    const existing = this.refreshes.get(token)

    if (existing) {
      return existing.result
    }

    const result = refreshAtApi(token)

    this.refreshes.set(token, { result, keepUntil: Number.POSITIVE_INFINITY })

    result.then(
      () => this.refreshes.set(token, { result, keepUntil: this.now() + this.reuseForMs }),
      // A failed call is not remembered, so the next request can try again.
      () => this.refreshes.delete(token),
    )

    return result
  }

  private prune(): void {
    const now = this.now()

    for (const [token, { keepUntil }] of this.refreshes) {
      if (keepUntil <= now) {
        this.refreshes.delete(token)
      }
    }
  }
}

export const refreshCoordinator = new RefreshCoordinator()

export interface SessionTokens extends TokenSet {
  /** When the API stops allowing refreshes of this login's token chain (ms since epoch). */
  refreshableUntil: number
}

/**
 * What to do with a session's token before calling the API:
 * - `expired`: the refresh window has ended; the user must sign in again.
 * - `refresh`: refresh first (it expires soon, a refresh was forced after a 401, or it was already
 *   refreshed and the API has deny-listed it).
 * - `use`: send it as is.
 */
export function tokenAction(
  tokens: SessionTokens,
  options: { now: number; refreshAheadMs: number; forceRefresh: boolean; wasRefreshed: boolean },
): 'expired' | 'refresh' | 'use' {
  if (options.now >= tokens.refreshableUntil) {
    return 'expired'
  }

  if (
    options.forceRefresh ||
    options.wasRefreshed ||
    tokens.expiresAt - options.now < options.refreshAheadMs
  ) {
    return 'refresh'
  }

  return 'use'
}
