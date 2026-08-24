jest.mock("@/services/btcmap", () => ({
  submitPlace: jest.fn(),
}))

import { BtcMap } from "@/app"
import { AccountLevel } from "@/domain/accounts"
import {
  BtcMapSubmitPlaceError,
  InsufficientAccountLevelError,
} from "@/domain/btcmap/errors"
import { AccountsRepository } from "@/services/mongoose"
import * as BtcMapService from "@/services/btcmap"

import {
  createUserAndWalletFromPhone,
  getAccountByPhone,
  randomPhone,
} from "test/helpers"

const mockSubmitPlace = BtcMapService.submitPlace as jest.Mock

let account: Account
const phone = randomPhone()

const baseArgs = {
  latitude: 4.6097,
  longitude: -74.0817,
  category: "food",
  name: "Arepas Place",
}

const upgradeToLevelTwo = async (): Promise<Account> => {
  const updated = await AccountsRepository().update({
    ...account,
    level: AccountLevel.Two,
  })
  if (updated instanceof Error) throw updated
  return updated
}

beforeAll(async () => {
  await createUserAndWalletFromPhone(phone)
  account = await getAccountByPhone(phone)
})

beforeEach(() => {
  jest.clearAllMocks()
})

describe("BtcMap.submitPlace", () => {
  it("rejects accounts below level 2", async () => {
    const result = await BtcMap.submitPlace({ account, ...baseArgs })

    expect(result).toBeInstanceOf(InsufficientAccountLevelError)
    expect(mockSubmitPlace).not.toHaveBeenCalled()
  })

  it("submits a place for level 2 accounts", async () => {
    const levelTwoAccount = await upgradeToLevelTwo()

    const serviceResult = { id: 1, origin: "blink", external_id: "ext-id" }
    mockSubmitPlace.mockResolvedValue(serviceResult)

    const result = await BtcMap.submitPlace({ account: levelTwoAccount, ...baseArgs })

    expect(mockSubmitPlace).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      id: serviceResult.id,
      origin: serviceResult.origin,
      externalId: serviceResult.external_id,
    })
  })

  it("surfaces service errors", async () => {
    const levelTwoAccount = await upgradeToLevelTwo()
    mockSubmitPlace.mockResolvedValue(new BtcMapSubmitPlaceError())

    const result = await BtcMap.submitPlace({ account: levelTwoAccount, ...baseArgs })

    expect(result).toBeInstanceOf(BtcMapSubmitPlaceError)
  })
})
