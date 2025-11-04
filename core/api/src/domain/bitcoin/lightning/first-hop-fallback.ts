import {
  InsufficientBalanceForRoutingError,
  ProbeForRouteTimedOutError,
  RouteNotFoundError,
  TemporaryChannelFailureError,
  TemporaryNodeFailureError,
  UnknownNextPeerError,
} from "./errors"

/**
 * Determines if a payment error should trigger a fallback to routing without
 * a preferred first hop channel constraint.
 *
 * Retry-able errors are those that might succeed if we try a different route:
 * - RouteNotFoundError: No route found via the preferred channel
 * - InsufficientBalanceForRoutingError: Preferred channel lacks liquidity
 * - TemporaryChannelFailureError: Channel temporarily unavailable
 * - TemporaryNodeFailureError: Peer temporarily unavailable
 * - ProbeForRouteTimedOutError: Route probing timed out
 * - UnknownNextPeerError: Peer not reachable
 *
 * Non-retry-able errors won't be fixed by changing the route:
 * - LnAlreadyPaidError: Invoice already paid
 * - InvoiceExpiredOrBadPaymentHashError: Invoice expired/invalid
 * - PaymentRejectedByDestinationError: Recipient rejected payment
 * - InsufficientBalanceForLnPaymentError: Insufficient total balance
 * - PaymentAttemptsTimedOutError: Payment took too long
 * - InvalidFeatureBitsForLndInvoiceError: Invoice has invalid features
 *
 * @param error - The error from a payment or route probe attempt
 * @returns true if we should retry without the first hop constraint
 */
export const shouldRetryWithoutFirstHop = (error: Error): boolean => {
  return (
    error instanceof RouteNotFoundError ||
    error instanceof InsufficientBalanceForRoutingError ||
    error instanceof TemporaryChannelFailureError ||
    error instanceof TemporaryNodeFailureError ||
    error instanceof ProbeForRouteTimedOutError ||
    error instanceof UnknownNextPeerError
  )
}

