jest.mock("@/services/btcmap", () => ({
  submitPlace: jest.fn(),
}))

jest.mock("@/services/rate-limit", () => ({
  consumeLimiter: jest.fn(),
}))

import { submitPlace } from "@/app/btcmap"
import { AccountLevel } from "@/domain/accounts"
import {
  BtcMapSubmitPlaceError,
  InvalidBtcMapCategoryError,
} from "@/domain/btcmap/errors"
import {
  InsufficientAccountLevelError,
  InvalidBusinessTitleLengthError,
  InvalidCoordinatesError,
} from "@/domain/errors"
import { BtcMapPlaceSubmitPerAccountRateLimiterExceededError } from "@/domain/rate-limit/errors"
import * as BtcMapService from "@/services/btcmap"
import { consumeLimiter } from "@/services/rate-limit"

const mockSubmitPlace = BtcMapService.submitPlace as jest.Mock
const mockConsumeLimiter = consumeLimiter as jest.Mock

const accountId = "account-id" as AccountId
const makeAccount = (level: AccountLevel): Account =>
  ({ id: accountId, level }) as Account

const baseArgs = {
  latitude: 4.6097,
  longitude: -74.0817,
  category: "food",
  name: "Arepas Place",
}

describe("BtcMap submitPlace", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockConsumeLimiter.mockResolvedValue(true)
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

  it("rejects an invalid name", async () => {
    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
      name: "ab",
    })

    expect(result).toBeInstanceOf(InvalidBusinessTitleLengthError)
    expect(mockSubmitPlace).not.toHaveBeenCalled()
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

    // hmac-prefixed opaque id, no raw account id leaked
    expect(serviceArgs.externalId).toMatch(/^[0-9a-f]{16}:[0-9a-f-]{36}$/)
    expect(serviceArgs.externalId).not.toContain(accountId)

    // returns the locally generated externalId, not the upstream echo
    expect(result).toEqual({
      id: serviceResult.id,
      origin: serviceResult.origin,
      externalId: serviceArgs.externalId,
    })
  })

  it("surfaces service errors", async () => {
    mockSubmitPlace.mockResolvedValue(new BtcMapSubmitPlaceError())

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(result).toBeInstanceOf(BtcMapSubmitPlaceError)
  })
})
