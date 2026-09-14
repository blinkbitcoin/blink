import { DisplayAmountsConverter, displayAmountFromNumber } from "@/domain/fiat"
import { FeeReimbursement } from "@/domain/ledger/fee-reimbursement"
import {
  DisplayPriceRatio,
  WalletPriceRatio,
  toDisplayBaseAmount,
} from "@/domain/payments"
import {
  AmountCalculator,
  paymentAmountFromNumber,
  WalletCurrency,
  ZERO_CENTS,
  ZERO_SATS,
} from "@/domain/shared"

import { getSkipFeeReimbursement } from "@/config"

import * as LedgerFacade from "@/services/ledger/facade"
import { baseLogger } from "@/services/logger"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

const calc = AmountCalculator()

// The display values the real reimbursement path needs, as one object so the
// compiler enforces all-or-nothing. Absent only when the pending row's display
// metadata is unusable; the caller records that case before calling.
export type SenderDisplayAmounts = {
  senderDisplayAmount: DisplayCurrencyBaseAmount
  senderDisplayCurrency: DisplayCurrency
  senderDisplayCurrencyFractionDigits: number
}

export const reimburseFee = async <S extends WalletCurrency, R extends WalletCurrency>({
  paymentFlow,
  senderDisplay,
  journalId,
  actualFee,
  revealedPreImage,
}: {
  paymentFlow: PaymentFlow<S, R>
  senderDisplay: SenderDisplayAmounts | undefined
  journalId: LedgerJournalId
  actualFee: Satoshis
  revealedPreImage?: RevealedPreImage
}): Promise<true | ApplicationError> => {
  const actualFeeAmount = paymentAmountFromNumber({
    amount: actualFee,
    currency: WalletCurrency.Btc,
  })
  if (actualFeeAmount instanceof Error) return actualFeeAmount

  // reserve = total − bank fee
  const maxFeeAmounts = {
    btc: calc.max(
      calc.sub(paymentFlow.btcProtocolAndBankFee, paymentFlow.btcBankFee),
      ZERO_SATS,
    ),
    usd: calc.max(
      calc.sub(paymentFlow.usdProtocolAndBankFee, paymentFlow.usdBankFee),
      ZERO_CENTS,
    ),
  }

  const priceRatio = WalletPriceRatio(paymentFlow.paymentAmounts())
  if (priceRatio instanceof Error) return priceRatio

  const feeDifference = FeeReimbursement({
    prepaidFeeAmount: maxFeeAmounts,
    priceRatio,
  }).getReimbursement(actualFeeAmount)
  if (feeDifference instanceof Error) {
    baseLogger.warn(
      { maxFee: maxFeeAmounts, actualFee: actualFeeAmount },
      `Invalid reimbursement fee`,
    )
    return true
  }

  // TODO: only reimburse fees is this is above a (configurable) threshold
  // note: we would still need to log the fee difference to the account owner
  if (feeDifference.btc.amount === 0n) {
    return true
  }

  if (getSkipFeeReimbursement()) {
    const paymentHash = paymentFlow.paymentHashForFlow()
    if (paymentHash instanceof Error) return paymentHash

    const result = await LedgerFacade.recordLnFeeReserveRetained({
      paymentAmount: feeDifference.btc,
      metadata: LedgerFacade.LnReserveRetained({
        paymentAmount: feeDifference,
        paymentHash,
      }),
    })
    if (result instanceof Error) {
      recordExceptionInCurrentSpan({ error: result })
    }

    return true
  }

  if (senderDisplay === undefined) {
    // The reserve-retention branch above runs without display metadata; the
    // real reimbursement needs it. The malformed row was already recorded by
    // the caller, so skip the reimbursement without failing the settled
    // payment.
    return true
  }
  const {
    senderDisplayAmount,
    senderDisplayCurrency,
    senderDisplayCurrencyFractionDigits,
  } = senderDisplay

  const displayAmount = displayAmountFromNumber({
    amount: senderDisplayAmount,
    currency: senderDisplayCurrency,
    fractionDigits: senderDisplayCurrencyFractionDigits,
  })
  if (displayAmount instanceof Error) return displayAmount

  const displayPriceRatio = DisplayPriceRatio({
    displayAmount,
    walletAmount: paymentFlow.btcPaymentAmount,
    fractionDigits: senderDisplayCurrencyFractionDigits,
  })
  if (displayPriceRatio instanceof Error) return displayPriceRatio

  const {
    displayAmount: reimburseAmountDisplayCurrency,
    displayFee: reimburseFeeDisplayCurrency,
  } = DisplayAmountsConverter(displayPriceRatio).convert({
    btcPaymentAmount: feeDifference.btc,
    btcProtocolAndBankFee: ZERO_SATS,
    usdPaymentAmount: feeDifference.usd,
    usdProtocolAndBankFee: ZERO_CENTS,
  })

  const paymentHash = paymentFlow.paymentHashForFlow()
  if (paymentHash instanceof Error) return paymentHash

  const {
    metadata,
    creditAccountAdditionalMetadata,
    internalAccountsAdditionalMetadata,
  } = LedgerFacade.LnFeeReimbursementReceiveLedgerMetadata({
    paymentAmounts: {
      btcPaymentAmount: feeDifference.btc,
      usdPaymentAmount: feeDifference.usd,
      btcProtocolAndBankFee: ZERO_SATS,
      usdProtocolAndBankFee: ZERO_CENTS,
    },
    paymentHash,
    journalId,
    feeDisplayCurrency: toDisplayBaseAmount(reimburseFeeDisplayCurrency),
    amountDisplayCurrency: toDisplayBaseAmount(reimburseAmountDisplayCurrency),
    displayCurrency: senderDisplayCurrency,
    displayCurrencyFractionDigits: displayPriceRatio.fractionDigits,
  })

  const txMetadata: LnLedgerTransactionMetadataUpdate = {
    hash: paymentHash,
    revealedPreImage,
  }

  baseLogger.info(
    {
      feeDifference,
      maxFee: maxFeeAmounts,
      actualFee,
      paymentHash: paymentFlow.paymentHash,
    },
    "logging a fee difference",
  )

  const result = await LedgerFacade.recordReceiveOffChain({
    description: "fee reimbursement",
    recipientWalletDescriptor: paymentFlow.senderWalletDescriptor(),
    amountToCreditReceiver: {
      usd: feeDifference.usd,
      btc: feeDifference.btc,
    },
    metadata,
    additionalCreditMetadata: creditAccountAdditionalMetadata,
    additionalInternalMetadata: internalAccountsAdditionalMetadata,
    txMetadata,
  })
  if (result instanceof Error) return result

  return true
}
