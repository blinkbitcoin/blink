const LOCK_RETRY_DELAY_MS = 250
const LOCK_RETRY_JITTER_MS = 50

// a returning user's request waits at most `waitMs` for the account lock; 0 is a single attempt
export const reactivationLockSettings = ({
  waitMs,
}: {
  waitMs: number
}): LockRetrySettings => ({
  retryCount: Math.floor(waitMs / (LOCK_RETRY_DELAY_MS + LOCK_RETRY_JITTER_MS)),
  retryDelay: LOCK_RETRY_DELAY_MS,
  retryJitter: LOCK_RETRY_JITTER_MS,
})
