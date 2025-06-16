import { getOnChainDepositFeeConfiguration } from "@/app/wallets/get-on-chain-deposit-fee-config"
import { CouldNotFindMerchantFromUsernameError } from "@/domain/errors"
import * as mongoose from "@/services/mongoose"

jest.mock("@/config", () => {
  const config = jest.requireActual("@/config")
  return {
    ...config,
    getFeesConfig: jest.fn().mockReturnValue({
      depositDefaultMin: 100,
      depositThreshold: 10000,
      depositRatioAsBasisPoints: 10,
      merchantDepositDefaultMin: 50,
      merchantDepositThreshold: 5000,
      merchantDepositRatioAsBasisPoints: 5,
    }),
  }
})

describe("getOnChainDepositFeeConfiguration", () => {
  let merchantsRepoSpy: jest.SpyInstance

  beforeEach(() => {
    merchantsRepoSpy = jest.spyOn(mongoose, "MerchantsRepository")
  })

  afterEach(() => {
    merchantsRepoSpy.mockRestore()
  })

  it("should return default fees for an account without a username", async () => {
    const account = {} as Account
    const feeConfig = await getOnChainDepositFeeConfiguration({ account })
    const expectedConfig = {
      minBankFee: 100,
      minBankFeeThreshold: 10000,
      ratio: 10,
    }
    expect(feeConfig).toEqual(expectedConfig)
    expect(merchantsRepoSpy).not.toHaveBeenCalled()
  })

  it("should return default fees if the username is not a merchant", async () => {
    const account = {
      username: "notAMerchant",
    } as Account
    const findByUsernameMock = jest
      .fn()
      .mockResolvedValue(new CouldNotFindMerchantFromUsernameError(account.username))
    merchantsRepoSpy.mockReturnValue({
      findByUsername: findByUsernameMock,
    })

    const feeConfig = await getOnChainDepositFeeConfiguration({ account })

    const expectedConfig = {
      minBankFee: 100,
      minBankFeeThreshold: 10000,
      ratio: 10,
    }
    expect(feeConfig).toEqual(expectedConfig)
    expect(merchantsRepoSpy).toHaveBeenCalledTimes(1)
    expect(findByUsernameMock).toHaveBeenCalledWith("notAMerchant")
    expect(findByUsernameMock).toHaveBeenCalledTimes(1)
  })

  it("should return merchant fees for a single valid merchant account", async () => {
    const account = {
      username: "validMerchant",
    } as Account
    const mockMerchant = {
      id: "merchantId123" as MerchantId,
      username: "validMerchant" as Username,
      title: "Test Merchant" as BusinessMapTitle,
      coordinates: { latitude: 1, longitude: 1 },
      validated: true,
      createdAt: new Date(),
    }
    const findByUsernameMock = jest.fn().mockResolvedValue([mockMerchant])
    merchantsRepoSpy.mockReturnValue({
      findByUsername: findByUsernameMock,
    })

    const feeConfig = await getOnChainDepositFeeConfiguration({ account })

    const expectedConfig = {
      minBankFee: 50,
      minBankFeeThreshold: 5000,
      ratio: 5,
    }
    expect(feeConfig).toEqual(expectedConfig)
    expect(merchantsRepoSpy).toHaveBeenCalledTimes(1)
    expect(findByUsernameMock).toHaveBeenCalledWith("validMerchant")
    expect(findByUsernameMock).toHaveBeenCalledTimes(1)
  })

  it("should return default fees for a single not validated merchant account", async () => {
    const account = {
      username: "invalidMerchant",
    } as Account
    const mockMerchant = {
      id: "merchantId123" as MerchantId,
      username: "invalidMerchant" as Username,
      title: "Test Merchant" as BusinessMapTitle,
      coordinates: { latitude: 1, longitude: 1 },
      validated: false,
      createdAt: new Date(),
    }
    const findByUsernameMock = jest.fn().mockResolvedValue([mockMerchant])
    merchantsRepoSpy.mockReturnValue({
      findByUsername: findByUsernameMock,
    })

    const feeConfig = await getOnChainDepositFeeConfiguration({ account })

    const expectedConfig = {
      minBankFee: 100,
      minBankFeeThreshold: 10000,
      ratio: 10,
    }
    expect(feeConfig).toEqual(expectedConfig)
    expect(merchantsRepoSpy).toHaveBeenCalledTimes(1)
    expect(findByUsernameMock).toHaveBeenCalledWith("invalidMerchant")
    expect(findByUsernameMock).toHaveBeenCalledTimes(1)
  })

  it("should return merchant fees if at least one merchant in an array is validated", async () => {
    const account = {
      username: "mixedMerchants",
    } as Account
    const mockMerchants = [
      {
        id: "merchantId1" as MerchantId,
        username: "mixedMerchants" as Username,
        validated: false,
        createdAt: new Date(),
      },
      {
        id: "merchantId2" as MerchantId,
        username: "mixedMerchants" as Username,
        validated: true,
        createdAt: new Date(),
      },
    ]
    const findByUsernameMock = jest.fn().mockResolvedValue(mockMerchants)
    merchantsRepoSpy.mockReturnValue({
      findByUsername: findByUsernameMock,
    })

    const feeConfig = await getOnChainDepositFeeConfiguration({ account })

    const expectedConfig = {
      minBankFee: 50,
      minBankFeeThreshold: 5000,
      ratio: 5,
    }
    expect(feeConfig).toEqual(expectedConfig)
    expect(findByUsernameMock).toHaveBeenCalledWith("mixedMerchants")
  })

  it("should return default fees if all merchants in an array are not validated", async () => {
    const account = {
      username: "allInvalid",
    } as Account
    const mockMerchants = [
      {
        id: "merchantId3" as MerchantId,
        username: "allInvalid" as Username,
        validated: false,
        createdAt: new Date(),
      },
      {
        id: "merchantId4" as MerchantId,
        username: "allInvalid" as Username,
        validated: false,
        createdAt: new Date(),
      },
    ]
    const findByUsernameMock = jest.fn().mockResolvedValue(mockMerchants)
    merchantsRepoSpy.mockReturnValue({
      findByUsername: findByUsernameMock,
    })

    const feeConfig = await getOnChainDepositFeeConfiguration({ account })

    const expectedConfig = {
      minBankFee: 100,
      minBankFeeThreshold: 10000,
      ratio: 10,
    }
    expect(feeConfig).toEqual(expectedConfig)
    expect(findByUsernameMock).toHaveBeenCalledWith("allInvalid")
  })
})
