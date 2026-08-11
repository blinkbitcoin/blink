jest.mock("@/services/lnurl-pay", () => ({
  LnurlPayService: jest.fn(),
}))

jest.mock("@/services/redis", () => ({
  LnAddressVerifyCache: jest.fn(),
}))

import { createInvoiceForLnAddress } from "@/app/lnurl/create-invoice-for-ln-address"
import { getLnAddressInvoiceStatus } from "@/app/lnurl/get-ln-address-invoice-status"

import { ErrorFetchingLnurlInvoice } from "@/domain/bitcoin/lnurl/errors"
import { LnAddressInvoiceStatusNotFoundError } from "@/domain/bitcoin/lnurl/errors"
import { CouldNotFindError, UnknownRepositoryError } from "@/domain/errors"
import { LnurlPayService } from "@/services/lnurl-pay"
import { LnAddressVerifyCache } from "@/services/redis"

const mockLnurlPayService = LnurlPayService as jest.MockedFunction<typeof LnurlPayService>
const mockLnAddressVerifyCache = LnAddressVerifyCache as jest.MockedFunction<
  typeof LnAddressVerifyCache
>

const lnurlPayService = (
  overrides: Partial<Record<keyof ILnurlPayService, jest.Mock>>,
): ILnurlPayService =>
  ({
    fetchInvoiceFromLnAddressOrLnurl: jest.fn(),
    createInvoiceForLnAddress: jest.fn(),
    checkInvoiceStatusFromVerifyUrl: jest.fn(),
    ...overrides,
  }) as unknown as ILnurlPayService

const verifyCache = (
  overrides: Partial<Record<keyof ILnAddressVerifyCache, jest.Mock>>,
): ILnAddressVerifyCache =>
  ({
    store: jest.fn(),
    findByPaymentHash: jest.fn(),
    ...overrides,
  }) as unknown as ILnAddressVerifyCache

const paymentHash = "abcd1234" as PaymentHash
const invoice: LnAddressInvoice = {
  paymentRequest: "lnbc1test" as EncodedPaymentRequest,
  paymentHash,
  verify: "https://wallet.blink.test/verify/abcd1234",
}

describe("createInvoiceForLnAddress", () => {
  beforeEach(() => jest.resetAllMocks())

  it("returns a validation error for an invalid amount", async () => {
    const result = await createInvoiceForLnAddress({
      lnAddress: "twentyone@wallet.blink.test",
      amount: -1,
    })
    expect(result).toBeInstanceOf(Error)
  })

  it("creates an invoice and stores the verify url keyed by payment hash", async () => {
    const createInvoice = jest.fn().mockResolvedValue(invoice)
    const store = jest.fn().mockResolvedValue(true)
    mockLnurlPayService.mockReturnValue(
      lnurlPayService({ createInvoiceForLnAddress: createInvoice }),
    )
    mockLnAddressVerifyCache.mockReturnValue(verifyCache({ store }))

    const result = await createInvoiceForLnAddress({
      lnAddress: "twentyone@wallet.blink.test",
      amount: 200,
    })

    expect(result).toEqual(invoice)
    expect(store).toHaveBeenCalledWith({ paymentHash, verify: invoice.verify })
  })

  it("propagates service errors without storing", async () => {
    const createInvoice = jest
      .fn()
      .mockResolvedValue(new ErrorFetchingLnurlInvoice("boom"))
    const store = jest.fn()
    mockLnurlPayService.mockReturnValue(
      lnurlPayService({ createInvoiceForLnAddress: createInvoice }),
    )
    mockLnAddressVerifyCache.mockReturnValue(verifyCache({ store }))

    const result = await createInvoiceForLnAddress({
      lnAddress: "twentyone@wallet.blink.test",
      amount: 200,
    })

    expect(result).toBeInstanceOf(ErrorFetchingLnurlInvoice)
    expect(store).not.toHaveBeenCalled()
  })

  it("returns a repository error when storing fails", async () => {
    const createInvoice = jest.fn().mockResolvedValue(invoice)
    const store = jest.fn().mockResolvedValue(new UnknownRepositoryError("redis down"))
    mockLnurlPayService.mockReturnValue(
      lnurlPayService({ createInvoiceForLnAddress: createInvoice }),
    )
    mockLnAddressVerifyCache.mockReturnValue(verifyCache({ store }))

    const result = await createInvoiceForLnAddress({
      lnAddress: "twentyone@wallet.blink.test",
      amount: 200,
    })

    expect(result).toBeInstanceOf(UnknownRepositoryError)
  })
})

describe("getLnAddressInvoiceStatus", () => {
  beforeEach(() => jest.resetAllMocks())

  it("returns NotFound when no verify url is cached for the payment hash", async () => {
    const findByPaymentHash = jest
      .fn()
      .mockResolvedValue(new CouldNotFindError("missing"))
    mockLnAddressVerifyCache.mockReturnValue(verifyCache({ findByPaymentHash }))
    mockLnurlPayService.mockReturnValue(lnurlPayService({}))

    const result = await getLnAddressInvoiceStatus(paymentHash)

    expect(result).toBeInstanceOf(LnAddressInvoiceStatusNotFoundError)
  })

  it("fetches the cached verify url and returns settlement status", async () => {
    const findByPaymentHash = jest.fn().mockResolvedValue(invoice.verify)
    const checkStatus = jest
      .fn()
      .mockResolvedValue({ settled: true, preimage: "deadbeef" })
    mockLnAddressVerifyCache.mockReturnValue(verifyCache({ findByPaymentHash }))
    mockLnurlPayService.mockReturnValue(
      lnurlPayService({ checkInvoiceStatusFromVerifyUrl: checkStatus }),
    )

    const result = await getLnAddressInvoiceStatus(paymentHash)

    expect(result).toEqual({ settled: true, preimage: "deadbeef" })
    expect(checkStatus).toHaveBeenCalledWith(invoice.verify)
  })
})
