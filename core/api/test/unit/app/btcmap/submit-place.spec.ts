let mockBtcMapHmacSecret: string | undefined = "test-hmac-secret"

jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  get BTCMAP_HMAC_SECRET() {
    return mockBtcMapHmacSecret
  },
}))

jest.mock("@/services/btcmap", () => ({
  BtcMapService: jest.fn(),
  BTCMAP_ORIGIN: "blink",
}))

jest.mock("@/services/rate-limit", () => ({
  consumeLimiter: jest.fn(),
  rewardLimiter: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  BtcMapPlaceSubmissionsRepository: jest.fn(),
}))

jest.mock("@/services/lock", () => ({
  LockService: jest.fn(),
}))

import { submitPlace } from "@/app/btcmap"
import { AccountLevel } from "@/domain/accounts"
import { BtcMapPlaceSubmissionStatus } from "@/domain/btcmap"
import {
  BtcMapNotConfiguredError,
  BtcMapUnavailableError,
  CouldNotFindBtcMapPlaceSubmissionError,
  InvalidBtcMapCategoryError,
  InvalidBtcMapPlaceNameError,
  InvalidBtcMapSubmissionIdError,
} from "@/domain/btcmap/errors"
import {
  DuplicateKeyForPersistError,
  InsufficientAccountLevelError,
  InvalidCoordinatesError,
  UnknownRepositoryError,
} from "@/domain/errors"
import {
  ResourceAttemptsRedlockServiceError,
  ResourceExpiredLockServiceError,
} from "@/domain/lock"
import { BtcMapPlaceSubmitPerAccountRateLimiterExceededError } from "@/domain/rate-limit/errors"
import { BtcMapService } from "@/services/btcmap"
import { LockService } from "@/services/lock"
import { BtcMapPlaceSubmissionsRepository } from "@/services/mongoose"
import { consumeLimiter, rewardLimiter } from "@/services/rate-limit"

const mockBtcMapService = BtcMapService as jest.Mock
const mockConsumeLimiter = consumeLimiter as jest.Mock
const mockRewardLimiter = rewardLimiter as jest.Mock
const mockSubmissionsRepository = BtcMapPlaceSubmissionsRepository as jest.Mock
const mockLockService = LockService as jest.Mock

const mockSubmitPlace = jest.fn()
const mockFindSubmission = jest.fn()
const mockInsertPending = jest.fn()
const mockMarkSubmitted = jest.fn()
const mockLockBtcMapPlaceSubmission = jest.fn()

const accountId = "account-id" as AccountId
const makeAccount = (level: AccountLevel): Account =>
  ({ id: accountId, level }) as Account

const baseArgs = {
  submissionId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  latitude: 4.6097,
  longitude: -74.0817,
  category: "food",
  name: "Arepas Place",
}

const makeSubmission = (
  overrides: Partial<BtcMapPlaceSubmission> = {},
): BtcMapPlaceSubmission => ({
  accountId,
  submissionId: baseArgs.submissionId as BtcMapSubmissionId,
  externalId: "0123456789abcdef:f47ac10b-58cc-4372-a567-0e02b2c3d479",
  lat: baseArgs.latitude,
  lon: baseArgs.longitude,
  category: baseArgs.category as BtcMapCategory,
  name: baseArgs.name as BtcMapPlaceName,
  status: BtcMapPlaceSubmissionStatus.Pending,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe("BtcMap submitPlace", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockBtcMapHmacSecret = "test-hmac-secret"
    mockBtcMapService.mockReturnValue({ submitPlace: mockSubmitPlace })
    mockConsumeLimiter.mockResolvedValue(true)
    mockRewardLimiter.mockResolvedValue(true)
    mockSubmissionsRepository.mockReturnValue({
      findByAccountIdAndSubmissionId: mockFindSubmission,
      insertPending: mockInsertPending,
      markSubmitted: mockMarkSubmitted,
    })
    mockLockService.mockReturnValue({
      lockBtcMapPlaceSubmission: mockLockBtcMapPlaceSubmission,
    })
    mockLockBtcMapPlaceSubmission.mockImplementation((_, asyncFn) =>
      asyncFn({ aborted: false }),
    )
    mockFindSubmission.mockResolvedValue(new CouldNotFindBtcMapPlaceSubmissionError())
    mockInsertPending.mockResolvedValue(makeSubmission())
    mockMarkSubmitted.mockResolvedValue(
      makeSubmission({ status: BtcMapPlaceSubmissionStatus.Submitted, btcMapPlaceId: 1 }),
    )
  })

  it("rejects accounts below level 2", async () => {
    for (const level of [AccountLevel.Zero, AccountLevel.One]) {
      const result = await submitPlace({
        account: makeAccount(level),
        ...baseArgs,
      })

      expect(result).toBeInstanceOf(InsufficientAccountLevelError)
    }
    expect(mockConsumeLimiter).not.toHaveBeenCalled()
    expect(mockSubmitPlace).not.toHaveBeenCalled()
  })

  it("rejects an invalid submissionId", async () => {
    for (const submissionId of ["", "not-a-uuid", "f47ac10b58cc4372a5670e02b2c3d479"]) {
      const result = await submitPlace({
        account: makeAccount(AccountLevel.Two),
        ...baseArgs,
        submissionId,
      })

      expect(result).toBeInstanceOf(InvalidBtcMapSubmissionIdError)
    }
    expect(mockConsumeLimiter).not.toHaveBeenCalled()
    expect(mockSubmitPlace).not.toHaveBeenCalled()
  })

  it("rejects an invalid name", async () => {
    for (const name of ["ab", "   ", "x".repeat(101)]) {
      const result = await submitPlace({
        account: makeAccount(AccountLevel.Two),
        ...baseArgs,
        name,
      })

      expect(result).toBeInstanceOf(InvalidBtcMapPlaceNameError)
    }
    expect(mockSubmitPlace).not.toHaveBeenCalled()
  })

  it("trims the name before submitting", async () => {
    mockSubmitPlace.mockResolvedValue({ id: 1, origin: "blink", external_id: "ext" })

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
      name: "  Arepas Place  ",
    })

    expect(result).not.toBeInstanceOf(Error)
    expect(mockSubmitPlace.mock.calls[0][0].name).toBe("Arepas Place")
  })

  it("rejects an invalid category", async () => {
    for (const category of ["", "  ", "Food", "fast food", "x".repeat(51)]) {
      const result = await submitPlace({
        account: makeAccount(AccountLevel.Two),
        ...baseArgs,
        category,
      })

      expect(result).toBeInstanceOf(InvalidBtcMapCategoryError)
    }
    expect(mockSubmitPlace).not.toHaveBeenCalled()
  })

  it("rejects invalid coordinates", async () => {
    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
      latitude: 91,
    })

    expect(result).toBeInstanceOf(InvalidCoordinatesError)
    expect(mockSubmitPlace).not.toHaveBeenCalled()
  })

  it("does not consume the rate limit when the service is not configured", async () => {
    mockBtcMapService.mockReturnValue(new BtcMapNotConfiguredError())

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(result).toBeInstanceOf(BtcMapNotConfiguredError)
    expect(mockConsumeLimiter).not.toHaveBeenCalled()
    expect(mockFindSubmission).not.toHaveBeenCalled()
  })

  it("does not consume the rate limit when the hmac secret is not set", async () => {
    mockBtcMapHmacSecret = undefined

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(result).toBeInstanceOf(BtcMapNotConfiguredError)
    expect(mockConsumeLimiter).not.toHaveBeenCalled()
    expect(mockFindSubmission).not.toHaveBeenCalled()
  })

  it("returns the repository error without consuming quota when the record lookup fails", async () => {
    mockFindSubmission.mockResolvedValue(new UnknownRepositoryError("mongo down"))

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(result).toBeInstanceOf(UnknownRepositoryError)
    expect(mockConsumeLimiter).not.toHaveBeenCalled()
    expect(mockInsertPending).not.toHaveBeenCalled()
    expect(mockSubmitPlace).not.toHaveBeenCalled()
  })

  it("rejects when the per-account rate limit is exceeded", async () => {
    mockConsumeLimiter.mockResolvedValue(
      new BtcMapPlaceSubmitPerAccountRateLimiterExceededError(),
    )

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(result).toBeInstanceOf(BtcMapPlaceSubmitPerAccountRateLimiterExceededError)
    expect(mockConsumeLimiter).toHaveBeenCalledTimes(1)
    expect(mockConsumeLimiter.mock.calls[0][0].keyToConsume).toEqual(accountId)
    expect(mockInsertPending).not.toHaveBeenCalled()
    expect(mockSubmitPlace).not.toHaveBeenCalled()
  })

  it("submits a place for level 2 accounts with an opaque external id", async () => {
    const serviceResult = { id: 1, origin: "blink", external_id: "upstream-ext-id" }
    mockSubmitPlace.mockResolvedValue(serviceResult)

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(mockSubmitPlace).toHaveBeenCalledTimes(1)
    const serviceArgs = mockSubmitPlace.mock.calls[0][0]
    expect(serviceArgs.lat).toEqual(baseArgs.latitude)
    expect(serviceArgs.lon).toEqual(baseArgs.longitude)
    expect(serviceArgs.category).toEqual(baseArgs.category)
    expect(serviceArgs.name).toEqual(baseArgs.name)

    // hmac-prefixed opaque id derived from the client-supplied submissionId,
    // no raw account id leaked
    expect(serviceArgs.externalId).toMatch(/^[0-9a-f]{16}:[0-9a-f-]{36}$/)
    expect(serviceArgs.externalId.endsWith(`:${baseArgs.submissionId}`)).toBe(true)
    expect(serviceArgs.externalId).not.toContain(accountId)

    // persists the operation before the upstream call and marks it with the
    // upstream id after success
    expect(mockInsertPending).toHaveBeenCalledTimes(1)
    expect(mockInsertPending.mock.calls[0][0]).toMatchObject({
      accountId,
      submissionId: baseArgs.submissionId,
      externalId: serviceArgs.externalId,
    })
    expect(mockMarkSubmitted).toHaveBeenCalledTimes(1)
    expect(mockMarkSubmitted.mock.calls[0][0]).toMatchObject({
      accountId,
      submissionId: baseArgs.submissionId,
      btcMapPlaceId: serviceResult.id,
    })
    const insertOrder = mockInsertPending.mock.invocationCallOrder[0]
    const upstreamOrder = mockSubmitPlace.mock.invocationCallOrder[0]
    expect(insertOrder).toBeLessThan(upstreamOrder)

    // returns the locally generated externalId, not the upstream echo
    expect(result).toEqual({
      id: serviceResult.id,
      origin: serviceResult.origin,
      externalId: serviceArgs.externalId,
    })
    expect(mockRewardLimiter).not.toHaveBeenCalled()
  })

  it("returns the recorded result on replay without re-calling upstream", async () => {
    mockFindSubmission.mockResolvedValue(
      makeSubmission({
        status: BtcMapPlaceSubmissionStatus.Submitted,
        btcMapPlaceId: 42,
      }),
    )

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(result).not.toBeInstanceOf(Error)
    if (result instanceof Error) return
    expect(result.id).toEqual(42)
    expect(result.origin).toEqual("blink")
    expect(result.externalId.endsWith(`:${baseArgs.submissionId}`)).toBe(true)
    expect(mockConsumeLimiter).not.toHaveBeenCalled()
    expect(mockInsertPending).not.toHaveBeenCalled()
    expect(mockSubmitPlace).not.toHaveBeenCalled()
  })

  it("resubmits with the same external id when the fields changed (edit by resubmit)", async () => {
    // btcmap's only update mechanism is patch-by-resubmit with the same
    // external_id, so a same-submissionId request with changed fields must
    // reach upstream rather than being short-circuited as a replay
    mockFindSubmission.mockResolvedValue(
      makeSubmission({
        status: BtcMapPlaceSubmissionStatus.Submitted,
        btcMapPlaceId: 42,
      }),
    )
    mockSubmitPlace.mockResolvedValue({ id: 42, origin: "blink", external_id: "ext" })

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
      name: "Arepas Place Fixed",
    })

    expect(result).not.toBeInstanceOf(Error)
    expect(mockConsumeLimiter).toHaveBeenCalledTimes(1)
    expect(mockInsertPending).not.toHaveBeenCalled()
    expect(mockSubmitPlace).toHaveBeenCalledTimes(1)
    const serviceArgs = mockSubmitPlace.mock.calls[0][0]
    expect(serviceArgs.externalId.endsWith(`:${baseArgs.submissionId}`)).toBe(true)
    expect(serviceArgs.name).toEqual("Arepas Place Fixed")
    expect(mockMarkSubmitted.mock.calls[0][0]).toMatchObject({
      btcMapPlaceId: 42,
      name: "Arepas Place Fixed",
    })
  })

  it("reuses the same external id when a client retries an ambiguous failure", async () => {
    // upstream may have committed the first submission even though no usable
    // response came back — btcmap dedupes on (origin, external_id), so the
    // retried mutation must carry the same external id
    mockSubmitPlace.mockResolvedValueOnce(new BtcMapUnavailableError())

    const firstResult = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })
    expect(firstResult).toBeInstanceOf(BtcMapUnavailableError)

    // the persisted pending record is found on retry, carrying the external
    // id the first attempt derived and inserted
    const firstExternalId = mockSubmitPlace.mock.calls[0][0].externalId
    mockFindSubmission.mockResolvedValue(makeSubmission({ externalId: firstExternalId }))
    mockSubmitPlace.mockResolvedValueOnce({
      id: 1,
      origin: "blink",
      external_id: firstExternalId,
    })
    const retryResult = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(mockSubmitPlace).toHaveBeenCalledTimes(2)
    expect(mockSubmitPlace.mock.calls[1][0].externalId).toEqual(
      mockSubmitPlace.mock.calls[0][0].externalId,
    )
    expect(mockInsertPending).toHaveBeenCalledTimes(1)
    expect(retryResult).not.toBeInstanceOf(Error)
  })

  it("scopes the external id per account for the same submissionId", async () => {
    mockSubmitPlace.mockResolvedValue({ id: 1, origin: "blink", external_id: "ext" })

    await submitPlace({ account: makeAccount(AccountLevel.Two), ...baseArgs })
    await submitPlace({
      account: { id: "other-account-id", level: AccountLevel.Two } as Account,
      ...baseArgs,
    })

    const [firstExternalId, secondExternalId] = mockSubmitPlace.mock.calls.map(
      (call) => call[0].externalId,
    )
    expect(firstExternalId).not.toEqual(secondExternalId)
    expect(firstExternalId.endsWith(`:${baseArgs.submissionId}`)).toBe(true)
    expect(secondExternalId.endsWith(`:${baseArgs.submissionId}`)).toBe(true)
  })

  it("canonicalizes submissionId casing for the operation, lock and external id", async () => {
    mockSubmitPlace.mockResolvedValue({ id: 1, origin: "blink", external_id: "ext" })

    const upper = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
      submissionId: baseArgs.submissionId.toUpperCase(),
    })
    const lower = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(upper).not.toBeInstanceOf(Error)
    expect(lower).not.toBeInstanceOf(Error)

    // both casings resolve to the same operation key, lock resource and
    // upstream identity
    expect(mockLockBtcMapPlaceSubmission.mock.calls[0][0]).toMatchObject({
      submissionId: baseArgs.submissionId,
    })
    expect(mockFindSubmission.mock.calls[0][0]).toMatchObject({
      submissionId: baseArgs.submissionId,
    })
    expect(mockInsertPending.mock.calls[0][0]).toMatchObject({
      submissionId: baseArgs.submissionId,
    })
    const [upperExternalId, lowerExternalId] = mockSubmitPlace.mock.calls.map(
      (call) => call[0].externalId,
    )
    expect(upperExternalId).toEqual(lowerExternalId)
    expect(upperExternalId.endsWith(`:${baseArgs.submissionId}`)).toBe(true)
  })

  it("replays with the persisted external id after an hmac secret change", async () => {
    // the record was committed under a secret that has since rotated
    mockBtcMapHmacSecret = "rotated-secret"
    mockFindSubmission.mockResolvedValue(
      makeSubmission({
        status: BtcMapPlaceSubmissionStatus.Submitted,
        btcMapPlaceId: 42,
      }),
    )

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(result).toMatchObject({
      id: 42,
      externalId: makeSubmission().externalId,
    })
    expect(mockConsumeLimiter).not.toHaveBeenCalled()
    expect(mockSubmitPlace).not.toHaveBeenCalled()
  })

  it("resubmits a pending retry under the persisted external id after an hmac secret change", async () => {
    mockBtcMapHmacSecret = "rotated-secret"
    mockFindSubmission.mockResolvedValue(makeSubmission()) // pending
    mockSubmitPlace.mockResolvedValue({ id: 42, origin: "blink", external_id: "ext" })

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(result).toMatchObject({ id: 42, externalId: makeSubmission().externalId })
    expect(mockSubmitPlace).toHaveBeenCalledTimes(1)
    expect(mockSubmitPlace.mock.calls[0][0].externalId).toEqual(
      makeSubmission().externalId,
    )
  })

  it("edits a committed submission under the persisted external id after an hmac secret change", async () => {
    mockBtcMapHmacSecret = "rotated-secret"
    mockFindSubmission.mockResolvedValue(
      makeSubmission({
        status: BtcMapPlaceSubmissionStatus.Submitted,
        btcMapPlaceId: 42,
      }),
    )
    mockSubmitPlace.mockResolvedValue({ id: 42, origin: "blink", external_id: "ext" })

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
      name: "Arepas Place Fixed",
    })

    expect(result).toMatchObject({ id: 42, externalId: makeSubmission().externalId })
    expect(mockSubmitPlace.mock.calls[0][0].externalId).toEqual(
      makeSubmission().externalId,
    )
    expect(mockSubmitPlace.mock.calls[0][0].name).toEqual("Arepas Place Fixed")
  })

  it("adopts the winner's persisted external id after a duplicate insert race", async () => {
    mockBtcMapHmacSecret = "rotated-secret"
    mockInsertPending.mockResolvedValue(new DuplicateKeyForPersistError())
    mockFindSubmission
      .mockResolvedValueOnce(new CouldNotFindBtcMapPlaceSubmissionError())
      .mockResolvedValueOnce(makeSubmission()) // winner's record, still pending
    mockSubmitPlace.mockResolvedValue({ id: 42, origin: "blink", external_id: "ext" })

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(result).toMatchObject({ id: 42, externalId: makeSubmission().externalId })
    expect(mockSubmitPlace.mock.calls[0][0].externalId).toEqual(
      makeSubmission().externalId,
    )
  })

  it("refunds and returns the error when the winner cannot be refetched after a duplicate insert", async () => {
    mockInsertPending.mockResolvedValue(new DuplicateKeyForPersistError())
    mockFindSubmission
      .mockResolvedValueOnce(new CouldNotFindBtcMapPlaceSubmissionError())
      .mockResolvedValueOnce(new UnknownRepositoryError("mongo down"))

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(result).toBeInstanceOf(UnknownRepositoryError)
    expect(mockRewardLimiter).toHaveBeenCalledTimes(1)
    expect(mockSubmitPlace).not.toHaveBeenCalled()
    expect(mockMarkSubmitted).not.toHaveBeenCalled()
  })

  it("refunds and skips the upstream call when the lock aborts before submission", async () => {
    // the lock is lost after quota and persistence but before the upstream
    // call: the entry guard passes, the pre-submission guard trips
    let abortedReads = 0
    mockLockBtcMapPlaceSubmission.mockImplementation((_, asyncFn) =>
      asyncFn({
        get aborted() {
          return ++abortedReads > 1
        },
      }),
    )

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(result).toBeInstanceOf(ResourceExpiredLockServiceError)
    expect(mockConsumeLimiter).toHaveBeenCalledTimes(1)
    expect(mockInsertPending).toHaveBeenCalledTimes(1)
    expect(mockRewardLimiter).toHaveBeenCalledTimes(1)
    expect(mockSubmitPlace).not.toHaveBeenCalled()
    expect(mockMarkSubmitted).not.toHaveBeenCalled()
  })

  it("fails before the upstream call and refunds when the pending record cannot be persisted", async () => {
    mockInsertPending.mockResolvedValue(new UnknownRepositoryError("mongo down"))

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(result).toBeInstanceOf(UnknownRepositoryError)
    expect(mockSubmitPlace).not.toHaveBeenCalled()
    expect(mockRewardLimiter).toHaveBeenCalledTimes(1)
  })

  it("proceeds when a concurrent identical request won the insert race", async () => {
    mockInsertPending.mockResolvedValue(new DuplicateKeyForPersistError())
    // the refetch after the duplicate insert finds the winner's record still
    // pending, so this request submits upstream and marks the shared record
    mockFindSubmission
      .mockResolvedValueOnce(new CouldNotFindBtcMapPlaceSubmissionError())
      .mockResolvedValueOnce(makeSubmission())
    mockSubmitPlace.mockResolvedValue({ id: 1, origin: "blink", external_id: "ext" })

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(result).not.toBeInstanceOf(Error)
    expect(mockSubmitPlace).toHaveBeenCalledTimes(1)
    expect(mockMarkSubmitted).toHaveBeenCalledTimes(1)
  })

  it("replays the winning record when a duplicate insert committed an identical payload", async () => {
    mockInsertPending.mockResolvedValue(new DuplicateKeyForPersistError())
    mockFindSubmission
      .mockResolvedValueOnce(new CouldNotFindBtcMapPlaceSubmissionError())
      .mockResolvedValueOnce(
        makeSubmission({
          status: BtcMapPlaceSubmissionStatus.Submitted,
          btcMapPlaceId: 42,
        }),
      )

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    // the identical operation already committed upstream: replay its result
    // without re-calling upstream, and refund the point never spent
    expect(result).toMatchObject({ id: 42, origin: "blink" })
    expect(mockSubmitPlace).not.toHaveBeenCalled()
    expect(mockMarkSubmitted).not.toHaveBeenCalled()
    expect(mockRewardLimiter).toHaveBeenCalledTimes(1)
  })

  it("submits as an edit when a duplicate insert holds a different payload", async () => {
    mockInsertPending.mockResolvedValue(new DuplicateKeyForPersistError())
    // the winning record carries a DIFFERENT payload — this request is an
    // edit, not a replay, and must reach upstream with its own fields
    mockFindSubmission
      .mockResolvedValueOnce(new CouldNotFindBtcMapPlaceSubmissionError())
      .mockResolvedValueOnce(
        makeSubmission({
          status: BtcMapPlaceSubmissionStatus.Submitted,
          btcMapPlaceId: 42,
          name: "Someone Elses Place" as BtcMapPlaceName,
        }),
      )
    mockSubmitPlace.mockResolvedValue({ id: 42, origin: "blink", external_id: "ext" })

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(result).not.toBeInstanceOf(Error)
    expect(mockSubmitPlace).toHaveBeenCalledTimes(1)
    expect(mockSubmitPlace.mock.calls[0][0].name).toEqual(baseArgs.name)
    expect(mockMarkSubmitted.mock.calls[0][0]).toMatchObject({
      btcMapPlaceId: 42,
      name: baseArgs.name,
    })
  })

  it("returns the lock error without consuming the rate limit when the lock cannot be acquired", async () => {
    mockLockBtcMapPlaceSubmission.mockResolvedValue(
      new ResourceAttemptsRedlockServiceError(),
    )

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(result).toBeInstanceOf(ResourceAttemptsRedlockServiceError)
    expect(mockConsumeLimiter).not.toHaveBeenCalled()
    expect(mockFindSubmission).not.toHaveBeenCalled()
    expect(mockSubmitPlace).not.toHaveBeenCalled()
  })

  it("still returns success when marking the submission submitted fails", async () => {
    mockSubmitPlace.mockResolvedValue({ id: 1, origin: "blink", external_id: "ext" })
    mockMarkSubmitted.mockResolvedValue(new UnknownRepositoryError("mongo down"))

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(result).not.toBeInstanceOf(Error)
  })

  it("refunds the rate limit when the submission fails upstream", async () => {
    mockSubmitPlace.mockResolvedValue(new BtcMapUnavailableError())

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(result).toBeInstanceOf(BtcMapUnavailableError)
    expect(mockRewardLimiter).toHaveBeenCalledTimes(1)
    expect(mockRewardLimiter.mock.calls[0][0].keyToConsume).toEqual(accountId)
  })

  it("still surfaces the service error when the refund fails", async () => {
    mockSubmitPlace.mockResolvedValue(new BtcMapUnavailableError())
    mockRewardLimiter.mockResolvedValue(new Error("redis down"))

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(result).toBeInstanceOf(BtcMapUnavailableError)
  })
})
