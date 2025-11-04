import {
  shouldRetryWithoutFirstHop,
  RouteNotFoundError,
  InsufficientBalanceForRoutingError,
  TemporaryChannelFailureError,
  TemporaryNodeFailureError,
  ProbeForRouteTimedOutError,
  UnknownNextPeerError,
  LnAlreadyPaidError,
  InvoiceExpiredOrBadPaymentHashError,
  PaymentRejectedByDestinationError,
  InsufficientBalanceForLnPaymentError,
  PaymentAttemptsTimedOutError,
  LnPaymentPendingError,
} from "@/domain/bitcoin/lightning"

describe("shouldRetryWithoutFirstHop", () => {
  describe("returns true for retry-able errors", () => {
    it("returns true for RouteNotFoundError", () => {
      const error = new RouteNotFoundError()
      expect(shouldRetryWithoutFirstHop(error)).toBe(true)
    })

    it("returns true for InsufficientBalanceForRoutingError", () => {
      const error = new InsufficientBalanceForRoutingError()
      expect(shouldRetryWithoutFirstHop(error)).toBe(true)
    })

    it("returns true for TemporaryChannelFailureError", () => {
      const error = new TemporaryChannelFailureError()
      expect(shouldRetryWithoutFirstHop(error)).toBe(true)
    })

    it("returns true for TemporaryNodeFailureError", () => {
      const error = new TemporaryNodeFailureError()
      expect(shouldRetryWithoutFirstHop(error)).toBe(true)
    })

    it("returns true for ProbeForRouteTimedOutError", () => {
      const error = new ProbeForRouteTimedOutError()
      expect(shouldRetryWithoutFirstHop(error)).toBe(true)
    })

    it("returns true for UnknownNextPeerError", () => {
      const error = new UnknownNextPeerError()
      expect(shouldRetryWithoutFirstHop(error)).toBe(true)
    })
  })

  describe("returns false for non-retry-able errors", () => {
    it("returns false for LnAlreadyPaidError", () => {
      const error = new LnAlreadyPaidError()
      expect(shouldRetryWithoutFirstHop(error)).toBe(false)
    })

    it("returns false for InvoiceExpiredOrBadPaymentHashError", () => {
      const error = new InvoiceExpiredOrBadPaymentHashError()
      expect(shouldRetryWithoutFirstHop(error)).toBe(false)
    })

    it("returns false for PaymentRejectedByDestinationError", () => {
      const error = new PaymentRejectedByDestinationError()
      expect(shouldRetryWithoutFirstHop(error)).toBe(false)
    })

    it("returns false for InsufficientBalanceForLnPaymentError", () => {
      const error = new InsufficientBalanceForLnPaymentError()
      expect(shouldRetryWithoutFirstHop(error)).toBe(false)
    })

    it("returns false for PaymentAttemptsTimedOutError", () => {
      const error = new PaymentAttemptsTimedOutError()
      expect(shouldRetryWithoutFirstHop(error)).toBe(false)
    })

    it("returns false for LnPaymentPendingError", () => {
      const error = new LnPaymentPendingError()
      expect(shouldRetryWithoutFirstHop(error)).toBe(false)
    })

    it("returns false for generic Error", () => {
      const error = new Error("Some other error")
      expect(shouldRetryWithoutFirstHop(error)).toBe(false)
    })
  })
})

