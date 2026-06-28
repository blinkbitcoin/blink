import { toSats } from "@/domain/bitcoin"
import { LedgerTransactionType } from "@/domain/ledger"
import {
  MissingPropsInTransactionForPaymentFlowError,
  NonLnPaymentTransactionForPaymentFlowError,
  PaymentFlow,
  WalletPriceRatio,
} from "@/domain/payments"
import { paymentAmountFromNumber, WalletCurrency, ZERO_CENTS } from "@/domain/shared"
import { PaymentInitiationMethod, SettlementMethod } from "@/domain/wallets"

export const PaymentFlowFromLedgerTransaction = <
  S extends WalletCurrency,
  R extends WalletCurrency,
>({
  ledgerTxn,
  senderAccountId,
  bankFee = toSats(0),
}: {
  ledgerTxn: LedgerTransaction<S>
  senderAccountId: AccountId
  // Service-fee breakdown (sats), recovered from the self-identifying bank-owner
  // credit leg at reimbursement reconstruction (mirrors on-chain). Callers that
  // don't pass it (no-fee/legacy sends) get a ZERO breakdown → reserve = total.
  bankFee?: Satoshis
}): PaymentFlow<S, R> | ValidationError => {
  if (ledgerTxn.type !== LedgerTransactionType.Payment) {
    return new NonLnPaymentTransactionForPaymentFlowError()
  }
  const settlementMethod = SettlementMethod.Lightning
  const paymentInitiationMethod = PaymentInitiationMethod.Lightning

  const {
    walletId: senderWalletId,
    currency: senderWalletCurrency,
    paymentHash,
    satsAmount,
    centsAmount,
    satsFee,
    centsFee,
    timestamp: createdAt,
  } = ledgerTxn
  if (
    senderWalletId === undefined ||
    senderWalletCurrency === undefined ||
    paymentHash === undefined ||
    satsAmount === undefined ||
    centsAmount === undefined ||
    satsFee === undefined ||
    centsFee === undefined ||
    createdAt === undefined
  ) {
    return new MissingPropsInTransactionForPaymentFlowError()
  }

  const btcPaymentAmount = paymentAmountFromNumber({
    amount: satsAmount,
    currency: WalletCurrency.Btc,
  })
  if (btcPaymentAmount instanceof Error) return btcPaymentAmount

  const usdPaymentAmount = paymentAmountFromNumber({
    amount: centsAmount,
    currency: WalletCurrency.Usd,
  })
  if (usdPaymentAmount instanceof Error) return usdPaymentAmount

  const btcProtocolAndBankFee = paymentAmountFromNumber({
    amount: satsFee,
    currency: WalletCurrency.Btc,
  })
  if (btcProtocolAndBankFee instanceof Error) return btcProtocolAndBankFee

  const usdProtocolAndBankFee = paymentAmountFromNumber({
    amount: centsFee,
    currency: WalletCurrency.Usd,
  })
  if (usdProtocolAndBankFee instanceof Error) return usdProtocolAndBankFee

  // Model 2: btcProtocolAndBankFee (= satsFee) is the accounting TOTAL (routing
  // reserve + service fee). The service-fee breakdown is recovered from the
  // self-identifying bank-owner credit leg by the caller and passed in as
  // `bankFee` so reimbursement can isolate the routing reserve as
  // total − bankFee. No-fee/legacy sends pass ZERO → reserve = total.
  const btcBankFee = paymentAmountFromNumber({
    amount: bankFee,
    currency: WalletCurrency.Btc,
  })
  if (btcBankFee instanceof Error) return btcBankFee

  let usdBankFee = ZERO_CENTS
  if (btcBankFee.amount > 0n) {
    // Rebuild the usd breakdown via the same price ratio used at send time
    // (the persisted sats/cents amounts), so usdProtocolAndBankFee − usdBankFee
    // recovers the usd routing reserve exactly.
    const priceRatio = WalletPriceRatio({
      usd: usdPaymentAmount,
      btc: btcPaymentAmount,
    })
    if (priceRatio instanceof Error) return priceRatio
    usdBankFee = priceRatio.convertFromBtcToCeil(btcBankFee)
  }

  return PaymentFlow({
    senderWalletId,
    senderWalletCurrency,
    senderAccountId,
    settlementMethod,
    paymentInitiationMethod,

    paymentHash,
    descriptionFromInvoice: "",
    skipProbeForDestination: false,
    createdAt,
    paymentSentAndPending: true,

    btcPaymentAmount,
    usdPaymentAmount,
    inputAmount:
      senderWalletCurrency === WalletCurrency.Usd
        ? usdPaymentAmount.amount
        : btcPaymentAmount.amount,

    btcProtocolAndBankFee,
    usdProtocolAndBankFee,

    // Service-fee breakdown recovered from the bank-owner credit leg so
    // reimbursement refunds reserve = total − bankFee (service fee retained).
    btcBankFee,
    usdBankFee,
  })
}
