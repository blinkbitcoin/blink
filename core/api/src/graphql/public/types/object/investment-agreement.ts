import InvestmentAgreementPaymentStatus from "../scalar/investment-agreement-payment-status"
import InvestmentAgreementSigningStatus from "../scalar/investment-agreement-signing-status"

import { GT } from "@/graphql/index"
import CentAmount from "@/graphql/public/types/scalar/cent-amount"
import SatAmount from "@/graphql/shared/types/scalar/sat-amount"
import Timestamp from "@/graphql/shared/types/scalar/timestamp"

const InvestmentAgreement = GT.Object<InvestmentAgreement>({
  name: "InvestmentAgreement",
  description: "Terms and progress of an investment agreement.",
  fields: () => ({
    id: {
      type: GT.NonNull(GT.ID),
    },
    signingStatus: {
      type: GT.NonNull(InvestmentAgreementSigningStatus),
    },
    paymentStatus: {
      type: GT.NonNull(InvestmentAgreementPaymentStatus),
    },
    units: {
      type: GT.NonNull(GT.Int),
      description: "Number of units subscribed.",
      resolve: (source) => source.terms.units,
    },
    pricePerUnitUsdCents: {
      type: GT.NonNull(CentAmount),
      description: "Price of one unit in USD cents.",
      resolve: (source) => source.terms.pricePerUnitUsdCents,
    },
    totalUsdCents: {
      type: GT.NonNull(CentAmount),
      description: "Total subscription amount in USD cents.",
      resolve: (source) => source.terms.totalUsdCents,
    },
    preMoneyValuationUsdCents: {
      type: GT.NonNull(CentAmount),
      description: "Pre-money valuation in USD cents stated in the agreement.",
      resolve: (source) => source.terms.preMoneyValuationUsdCents,
    },
    btcUsdRateCents: {
      type: GT.NonNull(CentAmount),
      description: "Price of one bitcoin in USD cents used for the settlement.",
      resolve: (source) => source.terms.btcUsdRateCents,
    },
    settlementSats: {
      type: GT.NonNull(SatAmount),
      description: "Amount to pay in satoshis to settle the subscription.",
      resolve: (source) => source.terms.settlementSats,
    },
    quotedAt: {
      type: GT.NonNull(Timestamp),
      description: "When the bitcoin price used for the settlement was quoted.",
      resolve: (source) => source.terms.quotedAt,
    },
    paymentDeadline: {
      type: Timestamp,
      description: "Deadline to pay the settlement, set once every party signed.",
    },
  }),
})

export default InvestmentAgreement
