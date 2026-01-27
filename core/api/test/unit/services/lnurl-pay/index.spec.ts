jest.mock("lnurl-pay", () => ({
  utils: { toSats: (n: number) => n },
  requestInvoice: jest.fn(),
}))

jest.mock("@/services/logger", () => ({
  baseLogger: { error: jest.fn() },
}))

jest.mock("@/services/tracing", () => ({
  wrapAsyncFunctionsToRunInSpan: ({ fns }: { fns: Record<string, unknown> }) => fns,
}))

import { requestInvoice } from "lnurl-pay"

import { LnurlPayService } from "@/services/lnurl-pay"

const mockRequestInvoice = requestInvoice as jest.MockedFunction<typeof requestInvoice>

const makeAmount = (sats: number) =>
  ({
    amount: BigInt(sats),
    currency: "BTC",
  }) as BtcPaymentAmount

describe("LnurlPayService", () => {
  const service = LnurlPayService()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("fetchInvoiceFromLnAddressOrLnurl", () => {
    it("returns invoice with message successAction", async () => {
      mockRequestInvoice.mockResolvedValue({
        invoice: "lnbc1000...",
        hasValidAmount: true,
        successAction: { tag: "message", message: "Payment received!" },
      } as never)

      const result = await service.fetchInvoiceFromLnAddressOrLnurl({
        amount: makeAmount(1000),
        lnAddressOrLnurl: "user@example.com",
      })

      expect(result).not.toBeInstanceOf(Error)
      const response = result as { invoice: string; successAction: unknown }
      expect(response.invoice).toBe("lnbc1000...")
      expect(response.successAction).toEqual(
        expect.objectContaining({ tag: "message", message: "Payment received!" }),
      )
    })

    it("returns invoice with url successAction", async () => {
      mockRequestInvoice.mockResolvedValue({
        invoice: "lnbc2000...",
        hasValidAmount: true,
        successAction: {
          tag: "url",
          description: "View receipt",
          url: "https://example.com/receipt",
        },
      } as never)

      const result = await service.fetchInvoiceFromLnAddressOrLnurl({
        amount: makeAmount(2000),
        lnAddressOrLnurl: "user@example.com",
      })

      expect(result).not.toBeInstanceOf(Error)
      const response = result as { invoice: string; successAction: unknown }
      expect(response.invoice).toBe("lnbc2000...")
      expect(response.successAction).toEqual(
        expect.objectContaining({
          tag: "url",
          description: "View receipt",
          url: "https://example.com/receipt",
        }),
      )
    })

    it("returns invoice with aes successAction", async () => {
      mockRequestInvoice.mockResolvedValue({
        invoice: "lnbc3000...",
        hasValidAmount: true,
        successAction: {
          tag: "aes",
          description: "Encrypted",
          ciphertext: "base64data==",
          iv: "base64iv==",
        },
      } as never)

      const result = await service.fetchInvoiceFromLnAddressOrLnurl({
        amount: makeAmount(3000),
        lnAddressOrLnurl: "user@example.com",
      })

      expect(result).not.toBeInstanceOf(Error)
      const response = result as { invoice: string; successAction: unknown }
      expect(response.invoice).toBe("lnbc3000...")
      expect(response.successAction).toEqual(
        expect.objectContaining({
          tag: "aes",
          description: "Encrypted",
          ciphertext: "base64data==",
          iv: "base64iv==",
        }),
      )
    })

    it("returns null successAction for invalid payload and logs error", async () => {
      const { baseLogger } = jest.requireMock("@/services/logger")
      mockRequestInvoice.mockResolvedValue({
        invoice: "lnbc4000...",
        hasValidAmount: true,
        successAction: { tag: "unknown_tag" },
      } as never)

      const result = await service.fetchInvoiceFromLnAddressOrLnurl({
        amount: makeAmount(4000),
        lnAddressOrLnurl: "user@example.com",
      })

      expect(result).not.toBeInstanceOf(Error)
      const response = result as { invoice: string; successAction: unknown }
      expect(response.invoice).toBe("lnbc4000...")
      expect(response.successAction).toBeNull()
      expect(baseLogger.error).toHaveBeenCalled()
    })

    it("returns null successAction when not provided", async () => {
      mockRequestInvoice.mockResolvedValue({
        invoice: "lnbc5000...",
        hasValidAmount: true,
        successAction: null,
      } as never)

      const result = await service.fetchInvoiceFromLnAddressOrLnurl({
        amount: makeAmount(5000),
        lnAddressOrLnurl: "user@example.com",
      })

      expect(result).not.toBeInstanceOf(Error)
      const response = result as { invoice: string; successAction: unknown }
      expect(response.invoice).toBe("lnbc5000...")
      expect(response.successAction).toBeNull()
    })
  })
})
