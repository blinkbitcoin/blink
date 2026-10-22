import { mapError } from "@/graphql/error-map"
import { LightningPaymentError } from "@/graphql/error"

import { InvoiceCanceledError, InvoiceExpiredError } from "@/domain/errors"

describe("mapError - intraledger invoice payability", () => {
  it.each([
    ["expired", new InvoiceExpiredError(), "Invoice is expired"],
    ["canceled", new InvoiceCanceledError(), "Invoice is canceled"],
  ])("maps a %s invoice to a LightningPaymentError", (_label, error, message) => {
    const mapped = mapError(error)

    expect(mapped).toBeInstanceOf(LightningPaymentError)
    expect(mapped.message).toBe(message)
  })
})
