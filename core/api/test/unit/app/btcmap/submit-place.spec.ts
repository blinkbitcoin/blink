jest.mock("@/services/btcmap", () => ({
  submitPlace: jest.fn(),
}))

import { submitPlace } from "@/app/btcmap"
import { AccountLevel } from "@/domain/accounts"
import {
  BtcMapSubmitPlaceError,
  InsufficientAccountLevelError,
} from "@/domain/btcmap/errors"
import { InvalidCoordinatesError } from "@/domain/errors"
import * as BtcMapService from "@/services/btcmap"

const mockSubmitPlace = BtcMapService.submitPlace as jest.Mock

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
  })

  it("rejects accounts below level 2", async () => {
    for (const level of [AccountLevel.Zero, AccountLevel.One]) {
      const result = await submitPlace({
        account: makeAccount(level),
        ...baseArgs,
      })

      expect(result).toBeInstanceOf(InsufficientAccountLevelError)
    }
    expect(mockSubmitPlace).not.toHaveBeenCalled()
  })

  it("submits a place for level 2 accounts", async () => {
    const serviceResult = { id: 1, origin: "blink", external_id: "ext-id" }
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
    expect(serviceArgs.externalId).toMatch(new RegExp(`^${accountId}:`))

    expect(result).toEqual({
      id: serviceResult.id,
      origin: serviceResult.origin,
      externalId: serviceResult.external_id,
    })
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

  it("surfaces service errors", async () => {
    mockSubmitPlace.mockResolvedValue(new BtcMapSubmitPlaceError())

    const result = await submitPlace({
      account: makeAccount(AccountLevel.Two),
      ...baseArgs,
    })

    expect(result).toBeInstanceOf(BtcMapSubmitPlaceError)
  })
})
