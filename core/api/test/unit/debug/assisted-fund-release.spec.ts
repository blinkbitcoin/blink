jest.mock("@/app", () => ({ Accounts: {}, Payments: {} }))
jest.mock("@/app/prices", () => ({ getMidPriceRatio: jest.fn() }))
jest.mock("@/app/wallets", () => ({
  getBalanceForWallet: jest.fn(),
  listWalletsByAccountId: jest.fn(),
}))
jest.mock("@/app/wind-down", () => ({ checkReceiveAllowed: jest.fn() }))
jest.mock("@/config", () => ({ getAccountLimits: jest.fn(), getDealerConfig: jest.fn() }))
jest.mock("@/services/mongodb", () => ({ setupMongoConnection: jest.fn() }))
jest.mock("@/services/mongoose", () => ({ AccountsRepository: jest.fn() }))

import { parseCurrency, parseUpdatedBy, steps } from "@/debug/assisted-fund-release"
import { WalletCurrency } from "@/domain/shared"

describe("assisted-fund-release arg parsing", () => {
  describe("parseCurrency", () => {
    it("accepts BTC and USD", () => {
      expect(parseCurrency("BTC")).toEqual(WalletCurrency.Btc)
      expect(parseCurrency("USD")).toEqual(WalletCurrency.Usd)
    })

    it("rejects other values", () => {
      expect(parseCurrency("btc")).toBeInstanceOf(Error)
      expect(parseCurrency("EUR")).toBeInstanceOf(Error)
      expect(parseCurrency("")).toBeInstanceOf(Error)
      expect(parseCurrency(undefined)).toBeInstanceOf(Error)
    })
  })

  describe("parseUpdatedBy", () => {
    it("defaults to admin when omitted", () => {
      expect(parseUpdatedBy(undefined)).toEqual("admin")
      expect(parseUpdatedBy("")).toEqual("admin")
    })

    it("passes a case reference through", () => {
      expect(parseUpdatedBy("operator/CASE-123")).toEqual("operator/CASE-123")
    })

    it("rejects step names as likely mistyped commands", () => {
      for (const step of steps) {
        expect(parseUpdatedBy(step)).toBeInstanceOf(Error)
      }
    })

    it("does not reject values merely containing a step name", () => {
      expect(parseUpdatedBy("closer")).toEqual("closer")
      expect(parseUpdatedBy("operator/close-request")).toEqual("operator/close-request")
    })
  })
})
