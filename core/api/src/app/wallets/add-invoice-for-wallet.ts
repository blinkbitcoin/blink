import { validateIsBtcWallet, validateIsUsdWallet } from "./validate"

import { getCallbackServiceConfig } from "@/config"
import { AccountValidator } from "@/domain/accounts"
import { checkedToLedgerExternalId } from "@/domain/ledger"
import { checkedToWalletId } from "@/domain/wallets"
import { RateLimitConfig } from "@/domain/rate-limit"
import { checkedToMinutes, secondsToMinutes } from "@/domain/primitives"
import { RateLimiterExceededError } from "@/domain/rate-limit/errors"
import { INVOICE_EXPIRATIONS } from "@/domain/bitcoin/lightning/invoice-expiration"
import { WalletInvoiceBuilder } from "@/domain/wallet-invoices/wallet-invoice-builder"
import { WalletInvoiceWebhookStatus } from "@/domain/wallet-invoices"
import { checkedToBtcPaymentAmount, checkedToUsdPaymentAmount } from "@/domain/shared"

import { LndService } from "@/services/lnd"
import { consumeLimiter } from "@/services/rate-limit"
import { DealerPriceService } from "@/services/dealer-price"
import { CallbackService } from "@/services/svix"
import {
  AccountsRepository,
  WalletInvoicesRepository,
  WalletsRepository,
} from "@/services/mongoose"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

const defaultBtcExpiration = secondsToMinutes(INVOICE_EXPIRATIONS["BTC"].defaultValue)
const defaultNoAmountBtcExpiration = secondsToMinutes(
  INVOICE_EXPIRATIONS["BTC"].defaultValueNoAmount,
)
const defaultUsdExpiration = secondsToMinutes(INVOICE_EXPIRATIONS["USD"].defaultValue)
const defaultNoAmountUsdExpiration = secondsToMinutes(
  INVOICE_EXPIRATIONS["USD"].defaultValueNoAmount,
)

const addInvoiceForSelf = async ({
  walletId,
  walletAmount,
  memo = "",
  expiresIn,
  externalId,
}: AddInvoiceForSelfArgs): Promise<WalletInvoice | ApplicationError> => {
  return addInvoice({
    walletId,
    limitCheckFn: checkSelfWalletIdRateLimits,
    buildWIBWithAmountFn: ({
      walletInvoiceBuilder,
      recipientWalletDescriptor,
    }: BuildWIBWithAmountFnArgs) =>
      walletInvoiceBuilder
        .withExternalId(externalId)
        .withDescription({ description: memo })
        .generatedForSelf()
        .withRecipientWallet(recipientWalletDescriptor)
        .withExpiration(expiresIn)
        .withAmount(walletAmount),
  })
}

export const addInvoiceForSelfForBtcWallet = async (
  args: AddInvoiceForSelfForBtcWalletArgs,
): Promise<WalletInvoice | ApplicationError> => {
  const walletId = checkedToWalletId(args.walletId)
  if (walletId instanceof Error) return walletId

  const expiresIn = checkedToMinutes(args.expiresIn || defaultBtcExpiration)
  if (expiresIn instanceof Error) return expiresIn

  const validated = await validateIsBtcWallet(walletId)
  if (validated instanceof Error) return validated

  const walletAmount = checkedToBtcPaymentAmount(args.amount)
  if (walletAmount instanceof Error) return walletAmount

  const externalId = args.externalId
    ? checkedToLedgerExternalId(args.externalId)
    : undefined
  if (externalId instanceof Error) return externalId

  return addInvoiceForSelf({
    walletId,
    walletAmount,
    expiresIn,
    memo: args.memo,
    externalId,
  })
}

export const addInvoiceForSelfForUsdWallet = async (
  args: AddInvoiceForSelfForUsdWalletArgs,
): Promise<WalletInvoice | ApplicationError> => {
  const walletId = checkedToWalletId(args.walletId)
  if (walletId instanceof Error) return walletId

  const expiresIn = checkedToMinutes(args.expiresIn || defaultUsdExpiration)
  if (expiresIn instanceof Error) return expiresIn

  const validated = await validateIsUsdWallet(walletId)
  if (validated instanceof Error) return validated

  const walletAmount = checkedToUsdPaymentAmount(args.amount)
  if (walletAmount instanceof Error) return walletAmount

  const externalId = args.externalId
    ? checkedToLedgerExternalId(args.externalId)
    : undefined
  if (externalId instanceof Error) return externalId

  return addInvoiceForSelf({
    walletId,
    walletAmount,
    expiresIn,
    memo: args.memo,
    externalId,
  })
}

const addInvoiceNoAmountForSelf = async ({
  walletId,
  memo = "",
  expiresIn,
  externalId,
}: AddInvoiceNoAmountForSelfArgs): Promise<WalletInvoice | ApplicationError> => {
  return addInvoice({
    walletId,
    limitCheckFn: checkSelfWalletIdRateLimits,
    buildWIBWithAmountFn: ({
      walletInvoiceBuilder,
      recipientWalletDescriptor,
    }: BuildWIBWithAmountFnArgs) =>
      walletInvoiceBuilder
        .withExternalId(externalId)
        .withDescription({ description: memo })
        .generatedForSelf()
        .withRecipientWallet(recipientWalletDescriptor)
        .withExpiration(expiresIn)
        .withoutAmount(),
  })
}

export const addInvoiceNoAmountForSelfForAnyWallet = async (
  args: AddInvoiceNoAmountForSelfForAnyWalletArgs,
): Promise<WalletInvoice | ApplicationError> => {
  const walletId = checkedToWalletId(args.walletId)
  if (walletId instanceof Error) return walletId

  let defaultExpiresIn = defaultNoAmountBtcExpiration
  const validated = await validateIsBtcWallet(walletId)
  if (validated instanceof Error) {
    defaultExpiresIn = defaultNoAmountUsdExpiration
  }

  const expiresIn = checkedToMinutes(args.expiresIn || defaultExpiresIn)
  if (expiresIn instanceof Error) return expiresIn

  const externalId = args.externalId
    ? checkedToLedgerExternalId(args.externalId)
    : undefined
  if (externalId instanceof Error) return externalId

  return addInvoiceNoAmountForSelf({
    walletId,
    expiresIn,
    memo: args.memo,
    externalId,
  })
}

const addInvoiceForRecipient = async ({
  recipientWalletId,
  walletAmount,
  memo = "",
  descriptionHash,
  expiresIn,
  externalId,
  webhookUrl,
}: AddInvoiceForRecipientArgs): Promise<WalletInvoice | ApplicationError> => {
  return addInvoice({
    walletId: recipientWalletId,
    webhookUrl,
    limitCheckFn: checkRecipientWalletIdRateLimits,
    buildWIBWithAmountFn: ({
      walletInvoiceBuilder,
      recipientWalletDescriptor,
    }: BuildWIBWithAmountFnArgs) =>
      walletInvoiceBuilder
        .withExternalId(externalId)
        .withDescription({ description: memo, descriptionHash })
        .generatedForRecipient()
        .withRecipientWallet(recipientWalletDescriptor)
        .withExpiration(expiresIn)
        .withAmount(walletAmount),
  })
}

export const addInvoiceForRecipientForBtcWallet = async (
  args: AddInvoiceForRecipientForBtcWalletArgs,
): Promise<WalletInvoice | ApplicationError> => {
  const recipientWalletId = checkedToWalletId(args.recipientWalletId)
  if (recipientWalletId instanceof Error) return recipientWalletId

  const expiresIn = checkedToMinutes(args.expiresIn || defaultBtcExpiration)
  if (expiresIn instanceof Error) return expiresIn

  const validated = await validateIsBtcWallet(recipientWalletId)
  if (validated instanceof Error) return validated

  const walletAmount = checkedToBtcPaymentAmount(args.amount)
  if (walletAmount instanceof Error) return walletAmount

  const externalId = args.externalId
    ? checkedToLedgerExternalId(args.externalId)
    : undefined
  if (externalId instanceof Error) return externalId

  return addInvoiceForRecipient({
    recipientWalletId,
    walletAmount,
    expiresIn,
    descriptionHash: args.descriptionHash,
    memo: args.memo,
    externalId,
    webhookUrl: args.webhookUrl,
  })
}

export const addInvoiceForRecipientForUsdWallet = async (
  args: AddInvoiceForRecipientForUsdWalletArgs,
): Promise<WalletInvoice | ApplicationError> => {
  const recipientWalletId = checkedToWalletId(args.recipientWalletId)
  if (recipientWalletId instanceof Error) return recipientWalletId

  const expiresIn = checkedToMinutes(args.expiresIn || defaultUsdExpiration)
  if (expiresIn instanceof Error) return expiresIn

  const validated = await validateIsUsdWallet(recipientWalletId)
  if (validated instanceof Error) return validated

  const walletAmount = checkedToUsdPaymentAmount(args.amount)
  if (walletAmount instanceof Error) return walletAmount

  const externalId = args.externalId
    ? checkedToLedgerExternalId(args.externalId)
    : undefined
  if (externalId instanceof Error) return externalId

  return addInvoiceForRecipient({
    recipientWalletId,
    walletAmount,
    expiresIn,
    descriptionHash: args.descriptionHash,
    memo: args.memo,
    externalId,
    webhookUrl: args.webhookUrl,
  })
}

export const addInvoiceForRecipientForUsdWalletAndBtcAmount = async (
  args: AddInvoiceForRecipientForUsdWalletArgs,
): Promise<WalletInvoice | ApplicationError> => {
  const recipientWalletId = checkedToWalletId(args.recipientWalletId)
  if (recipientWalletId instanceof Error) return recipientWalletId

  const expiresIn = checkedToMinutes(args.expiresIn || defaultUsdExpiration)
  if (expiresIn instanceof Error) return expiresIn

  const validated = await validateIsUsdWallet(recipientWalletId)
  if (validated instanceof Error) return validated

  const walletAmount = checkedToBtcPaymentAmount(args.amount)
  if (walletAmount instanceof Error) return walletAmount

  const externalId = args.externalId
    ? checkedToLedgerExternalId(args.externalId)
    : undefined
  if (externalId instanceof Error) return externalId

  return addInvoiceForRecipient({
    recipientWalletId,
    walletAmount,
    expiresIn,
    descriptionHash: args.descriptionHash,
    memo: args.memo,
    externalId,
    webhookUrl: args.webhookUrl,
  })
}

const addInvoiceNoAmountForRecipient = async ({
  recipientWalletId,
  memo = "",
  expiresIn,
  externalId,
  webhookUrl,
}: AddInvoiceNoAmountForRecipientArgs): Promise<WalletInvoice | ApplicationError> => {
  return addInvoice({
    walletId: recipientWalletId,
    webhookUrl,
    limitCheckFn: checkRecipientWalletIdRateLimits,
    buildWIBWithAmountFn: ({
      walletInvoiceBuilder,
      recipientWalletDescriptor,
    }: BuildWIBWithAmountFnArgs) =>
      walletInvoiceBuilder
        .withExternalId(externalId)
        .withDescription({ description: memo })
        .generatedForRecipient()
        .withRecipientWallet(recipientWalletDescriptor)
        .withExpiration(expiresIn)
        .withoutAmount(),
  })
}

export const addInvoiceNoAmountForRecipientForAnyWallet = async (
  args: AddInvoiceNoAmountForRecipientForAnyWalletArgs,
): Promise<WalletInvoice | ApplicationError> => {
  const recipientWalletId = checkedToWalletId(args.recipientWalletId)
  if (recipientWalletId instanceof Error) return recipientWalletId

  let defaultExpiresIn = defaultNoAmountBtcExpiration
  const validated = await validateIsBtcWallet(recipientWalletId)
  if (validated instanceof Error) {
    defaultExpiresIn = defaultNoAmountUsdExpiration
  }

  const expiresIn = checkedToMinutes(args.expiresIn || defaultExpiresIn)
  if (expiresIn instanceof Error) return expiresIn

  const externalId = args.externalId
    ? checkedToLedgerExternalId(args.externalId)
    : undefined
  if (externalId instanceof Error) return externalId

  return addInvoiceNoAmountForRecipient({
    recipientWalletId,
    expiresIn,
    memo: args.memo,
    externalId,
    webhookUrl: args.webhookUrl,
  })
}

const addInvoice = async ({
  walletId,
  webhookUrl,
  limitCheckFn,
  buildWIBWithAmountFn,
}: AddInvoiceArgs): Promise<WalletInvoice | ApplicationError> => {
  const wallet = await WalletsRepository().findById(walletId)
  if (wallet instanceof Error) return wallet
  const account = await AccountsRepository().findById(wallet.accountId)
  if (account instanceof Error) return account

  const accountValidator = AccountValidator(account)
  if (accountValidator instanceof Error) return accountValidator

  const limitOk = await limitCheckFn(wallet.accountId)
  if (limitOk instanceof Error) return limitOk

  const lndService = LndService()
  if (lndService instanceof Error) return lndService

  const dealer = DealerPriceService()
  const walletInvoiceBuilder = WalletInvoiceBuilder({
    dealerBtcFromUsd: dealer.getSatsFromCentsForFutureBuy,
    dealerUsdFromBtc: dealer.getCentsFromSatsForFutureBuy,
    lnRegisterInvoice: lndService.registerInvoice,
  })
  if (walletInvoiceBuilder instanceof Error) return walletInvoiceBuilder

  const walletIBWithAmount = await buildWIBWithAmountFn({
    walletInvoiceBuilder,
    recipientWalletDescriptor: wallet,
  })
  if (walletIBWithAmount instanceof Error) return walletIBWithAmount

  const invoice = await walletIBWithAmount.registerInvoice()
  if (invoice instanceof Error) return invoice

  const callbackService = CallbackService(getCallbackServiceConfig())
  if (webhookUrl) {
    invoice.webhookUrl = webhookUrl
    invoice.webhookStatus = WalletInvoiceWebhookStatus.Pending

    const endpointId = await callbackService.addInvoiceEndpoint({
      paymentHash: invoice.paymentHash,
      url: webhookUrl,
    })
    if (endpointId instanceof Error) return endpointId
  }

  const persistedInvoice = await WalletInvoicesRepository().persistNew(invoice)
  if (persistedInvoice instanceof Error) {
    if (webhookUrl) {
      const deleted = await callbackService.deleteInvoiceApplication({
        paymentHash: invoice.paymentHash,
      })
      if (deleted instanceof Error) {
        recordExceptionInCurrentSpan({ error: deleted })
      }
    }
    return persistedInvoice
  }

  return invoice
}

const checkSelfWalletIdRateLimits = async (
  accountId: AccountId,
): Promise<true | RateLimiterExceededError> =>
  consumeLimiter({
    rateLimitConfig: RateLimitConfig.invoiceCreate,
    keyToConsume: accountId,
  })

const checkRecipientWalletIdRateLimits = async (
  accountId: AccountId,
): Promise<true | RateLimiterExceededError> =>
  consumeLimiter({
    rateLimitConfig: RateLimitConfig.invoiceCreateForRecipient,
    keyToConsume: accountId,
  })
