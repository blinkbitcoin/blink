let mockBtcMapHmacSecret: string | undefined = "test-hmac-secret"

jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  get BTCMAP_HMAC_SECRET() {
    return mockBtcMapHmacSecret
  },
}))

jest.mock("@/services/btcmap", () => ({
  BtcMapService: jest.fn(),
}))

jest.mock("@/services/rate-limit", () => ({
  consumeLimiter: jest.fn(),
  rewardLimiter: jest.fn(),
}))

import { submitPlace } from "@/app/btcmap"
import { AccountLevel } from "@/domain/accounts"
import {
  BtcMapNotConfiguredError,
  BtcMapUnavailableError,
  InvalidBtcMapCategoryError,
  InvalidBtcMapPlaceNameError,
  InvalidBtcMapSubmissionIdError,
} from "@/domain/btcmap/errors"
import { InsufficientAccountLevelError, InvalidCoordinatesError } from "@/domain/errors"
import { BtcMapPlaceSubmitPerAccountRateLimiterExceededError } from "@/domain/rate-limit/errors"
import { BtcMapService } from "@/services/btcmap"
import { consumeLimiter, rewardLimiter } from "@/services/rate-limit"

const mockBtcMapService = BtcMapService as jest.Mock
const mockConsumeLimiter = consumeLimiter as jest.Mock
const mockRewardLimiter = rewardLimiter as jest.Mock

const mockSubmitPlace = jest.fn()

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

describe("BtcMap submitPlace", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockBtcMapHmacSecret = "test-hmac-secret"
    mockBtcMapService.mockReturnValue({ submitPlace: mockSubmitPlace })
    mockConsumeLimiter.mockResolvedValue(true)
    mockRewardLimiter.mockResolvedValue(true)
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
  })

  it("does not consume the rate limit when the hmac secret is not set", async () => {
    mockBtcMapHmacSecret = undefined

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(result).toBeInstanceOf(BtcMapNotConfiguredError)
    expect(mockConsumeLimiter).not.toHaveBeenCalled()
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

    // returns the locally generated externalId, not the upstream echo
    expect(result).toEqual({
      id: serviceResult.id,
      origin: serviceResult.origin,
      externalId: serviceArgs.externalId,
    })
    expect(mockRewardLimiter).not.toHaveBeenCalled()
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

    mockSubmitPlace.mockResolvedValueOnce({
      id: 1,
      origin: "blink",
      external_id: mockSubmitPlace.mock.calls[0][0].externalId,
    })
    const retryResult = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(mockSubmitPlace).toHaveBeenCalledTimes(2)
    expect(mockSubmitPlace.mock.calls[1][0].externalId).toEqual(
      mockSubmitPlace.mock.calls[0][0].externalId,
    )
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
