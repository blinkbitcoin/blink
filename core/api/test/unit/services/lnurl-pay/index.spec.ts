import MockAdapter from "axios-mock-adapter"

jest.mock("@/config", () => ({
  LNURL_SERVER_LN_ADDRESS_DOMAIN: "wallet.blink.test",
}))

import { LnurlPayService, lnurlPayClient } from "@/services/lnurl-pay"
import {
  ErrorFetchingLnurlInvoice,
  UnsupportedLnAddressDomainError,
} from "@/domain/bitcoin/lnurl/errors"

let mock: MockAdapter

beforeAll(() => {
  mock = new MockAdapter(lnurlPayClient)
})

afterEach(() => {
  mock.reset()
})

const amount = { amount: BigInt(200), currency: "BTC" } as BtcPaymentAmount

describe("LnurlPayService - SSRF guards", () => {
  describe("createInvoiceForLnAddress", () => {
    it("rejects lightning addresses on a non-configured domain", async () => {
      const result = await LnurlPayService().createInvoiceForLnAddress({
        amount,
        lnAddress: "attacker@evil.example",
      })

      expect(result).toBeInstanceOf(UnsupportedLnAddressDomainError)
    })

    it("rejects malformed lightning addresses", async () => {
      const result = await LnurlPayService().createInvoiceForLnAddress({
        amount,
        lnAddress: "not-an-address",
      })

      expect(result).toBeInstanceOf(ErrorFetchingLnurlInvoice)
    })
  })

  describe("checkInvoiceStatusFromVerifyUrl", () => {
    it("refuses to fetch a verify url on an untrusted host", async () => {
      const result = await LnurlPayService().checkInvoiceStatusFromVerifyUrl(
        "https://evil.example/verify/abcd",
      )

      expect(result).toBeInstanceOf(UnsupportedLnAddressDomainError)
    })

    it("refuses a verify url on the same hostname but a different port", async () => {
      const result = await LnurlPayService().checkInvoiceStatusFromVerifyUrl(
        "https://wallet.blink.test:8443/verify/abcd",
      )

      expect(result).toBeInstanceOf(UnsupportedLnAddressDomainError)
    })

    it("refuses a plain-hostname verify url when the configured host is default-port", async () => {
      const result = await LnurlPayService().checkInvoiceStatusFromVerifyUrl(
        "http://wallet.blink.test:2049/verify/abcd",
      )

      expect(result).toBeInstanceOf(UnsupportedLnAddressDomainError)
    })

    it("rejects a non-http(s) protocol", async () => {
      const result = await LnurlPayService().checkInvoiceStatusFromVerifyUrl(
        "file:///etc/passwd",
      )

      expect(result).toBeInstanceOf(UnsupportedLnAddressDomainError)
    })

    it("parses a settled LUD-21 verify response from the trusted host", async () => {
      mock.onGet("https://wallet.blink.test/verify/abcd").reply(200, {
        status: "OK",
        settled: true,
        preimage: "deadbeef",
        pr: "lnbc1test",
      })

      const result = await LnurlPayService().checkInvoiceStatusFromVerifyUrl(
        "https://wallet.blink.test/verify/abcd",
      )

      expect(result).toEqual({ settled: true, preimage: "deadbeef" })
    })

    it("returns settled:false with null preimage for an unsettled invoice", async () => {
      mock.onGet("https://wallet.blink.test/verify/abcd").reply(200, {
        status: "OK",
        settled: false,
        preimage: null,
        pr: "lnbc1test",
      })

      const result = await LnurlPayService().checkInvoiceStatusFromVerifyUrl(
        "https://wallet.blink.test/verify/abcd",
      )

      expect(result).toEqual({ settled: false, preimage: null })
    })

    it("maps a LUD-21 ERROR response to an ErrorFetchingLnurlInvoice", async () => {
      mock.onGet("https://wallet.blink.test/verify/abcd").reply(200, {
        status: "ERROR",
        reason: "expired",
      })

      const result = await LnurlPayService().checkInvoiceStatusFromVerifyUrl(
        "https://wallet.blink.test/verify/abcd",
      )

      expect(result).toBeInstanceOf(ErrorFetchingLnurlInvoice)
    })
  })
})
