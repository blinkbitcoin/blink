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

// 2000 sats, payment hash 000102...0102 (fixture shared with decodeInvoice specs)
const bolt11With2000Sats =
  "lnbc20u1pvjluezhp58yjmdan79s6qqdhdzgynm4zwqd5d7xmw5fk98klysy043l2ahrqspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqfppqw508d6qejxtdg4y5r3zarvary0c5xw7kxqrrsssp5m6kmam774klwlh4dhmhaatd7al02m0h0m6kmam774klwlh4dhmhs9qypqqqcqpf3cwux5979a8j28d4ydwahx00saa68wq3az7v9jdgzkghtxnkf3z5t7q5suyq2dl9tqwsap8j0wptc82cpyvey9gf6zyylzrm60qtcqsq7egtsq"
const amount2000 = { amount: BigInt(2000), currency: "BTC" } as BtcPaymentAmount

const payRequestUrl = "https://wallet.blink.test/.well-known/lnurlp/alice"
const callbackUrl = "https://wallet.blink.test/lnurlp/alice/invoice"
const verifyUrl = "https://wallet.blink.test/verify/abcd"

const mockPayRequest = () =>
  mock.onGet(payRequestUrl).reply(200, {
    tag: "payRequest",
    callback: callbackUrl,
    minSendable: 1000,
    maxSendable: 100000000,
    metadata: "[]",
  })

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

    it("performs the LNURL-pay flow and returns invoice details", async () => {
      mockPayRequest()
      mock.onGet(callbackUrl).reply(200, {
        status: "OK",
        pr: bolt11With2000Sats,
        routes: [],
        verify: verifyUrl,
      })

      const result = await LnurlPayService().createInvoiceForLnAddress({
        amount: amount2000,
        lnAddress: "alice@wallet.blink.test",
      })

      expect(result).toEqual({
        paymentRequest: bolt11With2000Sats,
        paymentHash: "0001020304050607080900010203040506070809000102030405060708090102",
        verify: verifyUrl,
      })
    })

    it("refuses a callback on an untrusted host", async () => {
      mock.onGet(payRequestUrl).reply(200, {
        tag: "payRequest",
        callback: "https://evil.example/lnurlp/alice/invoice",
        minSendable: 1000,
        maxSendable: 100000000,
        metadata: "[]",
      })

      const result = await LnurlPayService().createInvoiceForLnAddress({
        amount: amount2000,
        lnAddress: "alice@wallet.blink.test",
      })

      expect(result).toBeInstanceOf(UnsupportedLnAddressDomainError)
    })

    it("refuses a verify url on an untrusted host", async () => {
      mockPayRequest()
      mock.onGet(callbackUrl).reply(200, {
        status: "OK",
        pr: bolt11With2000Sats,
        verify: "https://evil.example/verify/abcd",
      })

      const result = await LnurlPayService().createInvoiceForLnAddress({
        amount: amount2000,
        lnAddress: "alice@wallet.blink.test",
      })

      expect(result).toBeInstanceOf(UnsupportedLnAddressDomainError)
    })

    it("rejects an invoice whose amount does not match the request", async () => {
      mockPayRequest()
      mock.onGet(callbackUrl).reply(200, {
        status: "OK",
        pr: bolt11With2000Sats,
        verify: verifyUrl,
      })

      const result = await LnurlPayService().createInvoiceForLnAddress({
        amount: { amount: BigInt(999), currency: "BTC" } as BtcPaymentAmount,
        lnAddress: "alice@wallet.blink.test",
      })

      expect(result).toBeInstanceOf(ErrorFetchingLnurlInvoice)
      expect((result as Error).message).toMatch(/invalid amount/)
    })

    it("rejects an amount below minSendable", async () => {
      mockPayRequest()

      const result = await LnurlPayService().createInvoiceForLnAddress({
        amount: { amount: BigInt(0), currency: "BTC" } as BtcPaymentAmount,
        lnAddress: "alice@wallet.blink.test",
      })

      expect(result).toBeInstanceOf(ErrorFetchingLnurlInvoice)
      expect((result as Error).message).toMatch(/out of range/)
    })

    it("surfaces an LNURL ERROR from the callback", async () => {
      mockPayRequest()
      mock.onGet(callbackUrl).reply(200, {
        status: "ERROR",
        reason: "recipient offline",
      })

      const result = await LnurlPayService().createInvoiceForLnAddress({
        amount: amount2000,
        lnAddress: "alice@wallet.blink.test",
      })

      expect(result).toBeInstanceOf(ErrorFetchingLnurlInvoice)
      expect((result as Error).message).toBe("recipient offline")
    })

    it("errors when no LUD-21 verify url is returned", async () => {
      mockPayRequest()
      mock.onGet(callbackUrl).reply(200, {
        status: "OK",
        pr: bolt11With2000Sats,
      })

      const result = await LnurlPayService().createInvoiceForLnAddress({
        amount: amount2000,
        lnAddress: "alice@wallet.blink.test",
      })

      expect(result).toBeInstanceOf(ErrorFetchingLnurlInvoice)
      expect((result as Error).message).toMatch(/verify/)
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
      const result =
        await LnurlPayService().checkInvoiceStatusFromVerifyUrl("file:///etc/passwd")

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
