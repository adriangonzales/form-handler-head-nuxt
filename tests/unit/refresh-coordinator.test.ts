import { describe, expect, it, vi } from 'vitest'
import {
  RefreshCoordinator,
  tokenAction,
  type TokenSet,
} from '../../server/utils/refresh-coordinator'

const fresh: TokenSet = { token: 'new-token', expiresAt: 1_000_000 }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe('RefreshCoordinator', () => {
  it('shares one API refresh between concurrent requests for the same token', async () => {
    const coordinator = new RefreshCoordinator()
    const call = deferred<TokenSet | null>()
    const refreshAtApi = vi.fn(() => call.promise)

    const results = Array.from({ length: 10 }, () => coordinator.refresh('old-token', refreshAtApi))
    call.resolve(fresh)

    expect(await Promise.all(results)).toEqual(Array(10).fill(fresh))
    expect(refreshAtApi).toHaveBeenCalledTimes(1)
  })

  it('reuses a finished refresh for late requests still carrying the old token', async () => {
    let now = 0
    const coordinator = new RefreshCoordinator(60_000, () => now)
    const refreshAtApi = vi.fn(async () => fresh)

    await coordinator.refresh('old-token', refreshAtApi)
    now = 59_000

    expect(coordinator.wasRefreshed('old-token')).toBe(true)
    expect(await coordinator.refresh('old-token', refreshAtApi)).toEqual(fresh)
    expect(refreshAtApi).toHaveBeenCalledTimes(1)
  })

  it('forgets a refresh after the reuse window', async () => {
    let now = 0
    const coordinator = new RefreshCoordinator(60_000, () => now)

    await coordinator.refresh('old-token', async () => fresh)
    now = 60_000

    expect(coordinator.wasRefreshed('old-token')).toBe(false)
  })

  it('remembers a rejected refresh (401) so the old token is not retried', async () => {
    const coordinator = new RefreshCoordinator()
    const refreshAtApi = vi.fn(async () => null)

    expect(await coordinator.refresh('revoked', refreshAtApi)).toBeNull()
    expect(await coordinator.refresh('revoked', refreshAtApi)).toBeNull()
    expect(refreshAtApi).toHaveBeenCalledTimes(1)
  })

  it('does not remember a failed call, so the next request can retry', async () => {
    const coordinator = new RefreshCoordinator()
    const refreshAtApi = vi
      .fn<(token: string) => Promise<TokenSet | null>>()
      .mockRejectedValueOnce(new Error('API down'))
      .mockResolvedValueOnce(fresh)

    await expect(coordinator.refresh('old-token', refreshAtApi)).rejects.toThrow('API down')
    await Promise.resolve()

    expect(coordinator.wasRefreshed('old-token')).toBe(false)
    expect(await coordinator.refresh('old-token', refreshAtApi)).toEqual(fresh)
  })

  it('treats a token as refreshed while its refresh is in flight', () => {
    const coordinator = new RefreshCoordinator()

    void coordinator.refresh('old-token', () => new Promise(() => {}))

    expect(coordinator.wasRefreshed('old-token')).toBe(true)
  })
})

describe('tokenAction', () => {
  const day = 24 * 60 * 60 * 1000
  const tokens = { token: 't', expiresAt: 60 * 60 * 1000, refreshableUntil: 7 * day }
  const defaults = { now: 0, refreshAheadMs: 120_000, forceRefresh: false, wasRefreshed: false }

  it('uses a token that is valid for longer than the refresh margin', () => {
    expect(tokenAction(tokens, defaults)).toBe('use')
  })

  it('refreshes a token about to expire', () => {
    expect(tokenAction(tokens, { ...defaults, now: tokens.expiresAt - 60_000 })).toBe('refresh')
  })

  it('refreshes after a 401, or when the token was already refreshed', () => {
    expect(tokenAction(tokens, { ...defaults, forceRefresh: true })).toBe('refresh')
    expect(tokenAction(tokens, { ...defaults, wasRefreshed: true })).toBe('refresh')
  })

  it('ends the session once the 7-day refresh window has passed', () => {
    expect(tokenAction(tokens, { ...defaults, now: 7 * day })).toBe('expired')
    expect(tokenAction(tokens, { ...defaults, now: 7 * day, forceRefresh: true })).toBe('expired')
  })
})
