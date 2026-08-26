import { migrationDrainPlan, reserveForAmount } from "./execute-transfer"

import { getLnurlServerService } from "@/app/accounts/lnurl-server"
import { intraledgerPaymentSendWalletIdForPostMigrationDepositRelease } from "@/app/payments/send-intraledger"
import { payInvoiceByWalletIdForPostMigrationDepositRelease } from "@/app/payments/send-lightning"
import { updatePendingPaymentByHash } from "@/app/payments/update-pending-payments"
import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"

import {
  getCustodialMigrationFlowConfig,
  getSkipFeeReimbursement,
  LNURL_SERVER_LN_ADDRESS_DOMAIN,
  NETWORK,
} from "@/config"

import {
  checkedToAccountId,
  checkedToLightningAddress,
  PostMigrationAccountValidator,
} from "@/domain/accounts"
import { isSha256Hash, toSats } from "@/domain/bitcoin"
import { checkedToOnChainAddress } from "@/domain/bitcoin/onchain"
import { decodeInvoice, PaymentSendStatus } from "@/domain/bitcoin/lightning"
import { LedgerTransactionType } from "@/domain/ledger"
import {
  MigrationFlowPhase,
  MigrationInvalidDestinationError,
  MigrationStateConflictError,
  PostMigrationDepositReleaseStatus,
} from "@/domain/migration-flow"
import { checkedToBtcPaymentAmount, WalletCurrency } from "@/domain/shared"
import {
  LnPaymentState,
  LnPaymentStateDeterminator,
} from "@/domain/ledger/ln-payment-state"

import { LedgerService } from "@/services/ledger"
import { getBankOwnerWalletId } from "@/services/ledger/caching"
import { baseLogger } from "@/services/logger"
import {
  AccountsRepository,
  MigrationFlowStateRepository,
  PostMigrationDepositReleaseRepository,
  WalletsRepository,
} from "@/services/mongoose"
import { LnurlPayService } from "@/services/lnurl-pay"

type RawReleaseOutput = {
  accountId: string
  txHash: string
  vout: number
  address: string
  lightningAddress: string
}

export type PostMigrationDepositReleasePlan = {
  account: Account
  btcWallet: Wallet
  txHash: OnChainTxHash
  vout: OnChainTxVout
  address: OnChainAddress
  receiptJournalId: LedgerJournalId
  receiptAmountSats: Satoshis
  payoutAmountSats: Satoshis
  topUpSats: Satoshis
  lightningAddress: LightningAddress
  walletBalanceSats: Satoshis
}

export const inspectPostMigrationDepositRelease = async (
  raw: RawReleaseOutput,
): Promise<PostMigrationDepositReleasePlan | ApplicationError> => {
  if (!getSkipFeeReimbursement()) {
    return new MigrationStateConflictError(
      "post-migration release requires skipFeeReimbursement=true for deterministic accounting",
    )
  }

  const accountId = checkedToAccountId(raw.accountId)
  if (accountId instanceof Error) return accountId
  if (!isSha256Hash(raw.txHash)) {
    return new MigrationInvalidDestinationError("txHash must be 64 hexadecimal chars")
  }
  if (!Number.isSafeInteger(raw.vout) || raw.vout < 0) {
    return new MigrationInvalidDestinationError("vout must be a non-negative integer")
  }
  const txHash = raw.txHash.toLowerCase() as OnChainTxHash
  const vout = raw.vout as OnChainTxVout

  const address = checkedToOnChainAddress({
    network: NETWORK,
    value: raw.address,
  })
  if (address instanceof Error) return address

  const lightningAddress = checkedToLightningAddress(raw.lightningAddress)
  if (lightningAddress instanceof Error) return lightningAddress

  const account = await AccountsRepository().findById(accountId)
  if (account instanceof Error) return account
  const accountValidator = PostMigrationAccountValidator(account)
  if (accountValidator instanceof Error) return accountValidator

  const wallets = await WalletsRepository().findAccountWalletsByAccountId(accountId)
  if (wallets instanceof Error) return wallets
  const { USD: usdWallet } = wallets
  const btcWallet = await WalletsRepository().findById(wallets.BTC.id)
  if (btcWallet instanceof Error) return btcWallet
  const walletValidation = accountValidator.validateWalletForAccount(btcWallet)
  if (walletValidation instanceof Error) return walletValidation

  const usdBalance = await getBalanceForWallet({ walletId: usdWallet.id })
  if (usdBalance instanceof Error) return usdBalance
  if (usdBalance !== 0) {
    return new MigrationStateConflictError(
      `post-migration USD wallet balance must be zero, got ${usdBalance} cents`,
    )
  }

  const flow = await MigrationFlowStateRepository().findByAccountId(accountId)
  if (flow instanceof Error) return flow
  if (
    flow.phase !== MigrationFlowPhase.Completed ||
    !flow.destinationProofVerified ||
    !flow.destinationSparkPubkey
  ) {
    return new MigrationStateConflictError(
      "migration must be completed with a verified Spark destination",
    )
  }

  const identifierResult = splitLightningAddress(lightningAddress)
  if (identifierResult instanceof Error) return identifierResult
  const { identifier, domain } = identifierResult
  if (domain.toLowerCase() !== LNURL_SERVER_LN_ADDRESS_DOMAIN.toLowerCase()) {
    return new MigrationInvalidDestinationError(
      `Lightning address domain must be ${LNURL_SERVER_LN_ADDRESS_DOMAIN}`,
    )
  }

  const lnurlServer = getLnurlServerService()
  if (lnurlServer === null) {
    return new MigrationStateConflictError("LNURL server is not configured")
  }
  const mappedIdentifier = await lnurlServer.getIdentifier({ domain, identifier })
  if (mappedIdentifier instanceof Error) return mappedIdentifier
  if (
    mappedIdentifier.provider !== "spark" ||
    mappedIdentifier.providerDetails.sparkPubkey?.toLowerCase() !==
      flow.destinationSparkPubkey.toLowerCase()
  ) {
    return new MigrationInvalidDestinationError(
      "Lightning address is not mapped to the migration Spark destination",
    )
  }

  const receipt = await LedgerService().getOnChainReceiptForWallet({
    walletId: btcWallet.id,
    txHash,
    vout,
  })
  if (receipt instanceof Error) return receipt
  if (!receipt) {
    return new MigrationStateConflictError(
      `no settled on-chain receipt for ${txHash}:${vout}`,
    )
  }
  if (
    receipt.type !== LedgerTransactionType.OnchainReceipt ||
    receipt.pendingConfirmation ||
    receipt.walletId !== btcWallet.id ||
    receipt.currency !== WalletCurrency.Btc ||
    receipt.txHash !== txHash ||
    receipt.vout !== vout ||
    receipt.address !== address
  ) {
    return new MigrationStateConflictError(
      `on-chain receipt evidence does not exactly match ${txHash}:${vout}`,
    )
  }

  const receiptAmount = BigInt(receipt.credit)
  if (receiptAmount <= 0n) {
    return new MigrationStateConflictError(
      `on-chain receipt credit must be positive, got ${receiptAmount}`,
    )
  }
  const { deMinimisThresholdSats } = getCustodialMigrationFlowConfig()
  let payoutAmount: bigint
  let topUpAmount: bigint
  if (receiptAmount <= BigInt(deMinimisThresholdSats)) {
    payoutAmount = receiptAmount
    topUpAmount = reserveForAmount(receiptAmount)
  } else {
    const drainPlan = migrationDrainPlan(receiptAmount)
    if (drainPlan instanceof Error) return drainPlan
    payoutAmount = drainPlan.amount
    topUpAmount = drainPlan.residualTopUp
  }

  const walletBalance = await getBalanceForWallet({ walletId: btcWallet.id })
  if (walletBalance instanceof Error) return walletBalance
  if (BigInt(walletBalance) < receiptAmount) {
    return new MigrationStateConflictError(
      `BTC wallet balance ${walletBalance} is below receipt credit ${receiptAmount}`,
    )
  }

  return {
    account,
    btcWallet,
    txHash,
    vout,
    address,
    receiptJournalId: receipt.journalId,
    receiptAmountSats: toSats(receiptAmount),
    payoutAmountSats: toSats(payoutAmount),
    topUpSats: toSats(topUpAmount),
    lightningAddress,
    walletBalanceSats: toSats(walletBalance),
  }
}

export const preparePostMigrationDepositRelease = async ({
  caseReference,
  ...raw
}: RawReleaseOutput & {
  caseReference: string
}): Promise<PostMigrationDepositRelease | ApplicationError> => {
  if (!caseReference.trim()) {
    return new MigrationInvalidDestinationError("case reference is required")
  }
  const plan = await inspectPostMigrationDepositRelease(raw)
  if (plan instanceof Error) return plan

  const release = await PostMigrationDepositReleaseRepository().upsertPrepared({
    accountId: plan.account.id,
    walletId: plan.btcWallet.id,
    txHash: plan.txHash,
    vout: plan.vout,
    address: plan.address,
    receiptJournalId: plan.receiptJournalId,
    receiptAmountSats: plan.receiptAmountSats,
    payoutAmountSats: plan.payoutAmountSats,
    plannedTopUpSats: plan.topUpSats,
    topUpSats: toSats(0),
    lightningAddress: plan.lightningAddress,
    caseReference: caseReference.trim(),
  })
  if (release instanceof Error) return release

  const mismatch = releasePlanMismatch({ release, plan, caseReference })
  return mismatch ?? release
}

export const releasePostMigrationDeposit = async ({
  txHash,
  vout,
}: {
  txHash: OnChainTxHash
  vout: OnChainTxVout
}): Promise<PostMigrationDepositRelease | ApplicationError> => {
  const repo = PostMigrationDepositReleaseRepository()
  let resumedProcessing = false
  let release = await repo.claimForRelease({ txHash, vout })
  if (release instanceof Error) {
    const existing = await repo.findByOutput({ txHash, vout })
    if (existing instanceof Error) return release
    if (existing.status !== PostMigrationDepositReleaseStatus.Processing) {
      return release
    }
    resumedProcessing = true
    release = existing
  }

  const plan = await inspectPostMigrationDepositRelease({
    accountId: release.accountId,
    txHash: release.txHash,
    vout: release.vout,
    address: release.address,
    lightningAddress: release.lightningAddress,
  })
  if (plan instanceof Error) return failRelease(release, plan)
  const mismatch = releasePlanMismatch({
    release,
    plan,
    caseReference: release.caseReference,
  })
  if (mismatch) return failRelease(release, mismatch)
  if (
    resumedProcessing &&
    release.paymentHash &&
    release.plannedTopUpSats > 0 &&
    release.topUpSats === 0
  ) {
    return new MigrationStateConflictError(
      "top-up state is ambiguous; inspect the ledger before continuing",
    )
  }

  let invoice = release.paymentRequest
  if (!invoice) {
    const amount = checkedToBtcPaymentAmount(plan.payoutAmountSats)
    if (amount instanceof Error) return failRelease(release, amount)
    const fetchedInvoice = await LnurlPayService().fetchInvoiceFromLnAddressOrLnurl({
      amount,
      lnAddressOrLnurl: plan.lightningAddress,
    })
    if (fetchedInvoice instanceof Error) return failRelease(release, fetchedInvoice)
    invoice = fetchedInvoice
  }

  const decoded = decodeInvoice(invoice)
  if (decoded instanceof Error) return failRelease(release, decoded)
  if (decoded.paymentAmount?.amount !== BigInt(plan.payoutAmountSats)) {
    return failRelease(
      release,
      new MigrationInvalidDestinationError("LNURL invoice amount changed"),
    )
  }
  if (release.paymentHash && release.paymentHash !== decoded.paymentHash) {
    return failRelease(
      release,
      new MigrationStateConflictError("stored invoice payment hash changed"),
    )
  }

  if (!release.paymentHash) {
    const withPayment = await repo.recordPayment({
      txHash,
      vout,
      paymentHash: decoded.paymentHash,
      paymentRequest: invoice,
    })
    if (withPayment instanceof Error) return withPayment
    release = withPayment
  }

  if (plan.topUpSats > 0 && release.topUpSats === 0) {
    const topUp = await transferBankOwnerTopUp({
      release,
      amount: plan.topUpSats,
    })
    if (topUp instanceof Error) return failRelease(release, topUp)
    const recordedTopUp = await repo.recordTopUp({
      txHash,
      vout,
      topUpSats: plan.topUpSats,
    })
    if (recordedTopUp instanceof Error) return recordedTopUp
    release = recordedTopUp
  }

  const payment = await payInvoiceByWalletIdForPostMigrationDepositRelease({
    uncheckedPaymentRequest: invoice,
    memo: `post-migration deposit release ${release.caseReference}`,
    senderWalletId: release.walletId,
    senderAccount: plan.account,
  })
  if (payment instanceof Error) {
    const reclaimed = await reclaimTopUp(release)
    if (reclaimed instanceof Error) return reclaimed
    return failRelease(release, payment)
  }

  const to =
    payment.status === PaymentSendStatus.Success
      ? PostMigrationDepositReleaseStatus.Completed
      : PostMigrationDepositReleaseStatus.Pending
  return repo.updateStatus({
    txHash,
    vout,
    from: PostMigrationDepositReleaseStatus.Processing,
    to,
  })
}

export const reconcilePostMigrationDepositRelease = async ({
  txHash,
  vout,
}: {
  txHash: OnChainTxHash
  vout: OnChainTxVout
}): Promise<PostMigrationDepositRelease | ApplicationError> => {
  const repo = PostMigrationDepositReleaseRepository()
  const release = await repo.findByOutput({ txHash, vout })
  if (release instanceof Error) return release
  if (
    release.status === PostMigrationDepositReleaseStatus.Completed ||
    release.status === PostMigrationDepositReleaseStatus.Failed
  ) {
    return release
  }
  if (!release.paymentHash) {
    return new MigrationStateConflictError("release has no bound payment hash")
  }

  const reconciled = await updatePendingPaymentByHash({
    paymentHash: release.paymentHash,
    logger: baseLogger,
  })
  if (reconciled instanceof Error) return reconciled

  const txns = await LedgerService().getTransactionsByHash(release.paymentHash)
  if (txns instanceof Error) return txns
  const state = LnPaymentStateDeterminator(txns).determine()
  if (state instanceof Error) return state

  if (
    state === LnPaymentState.Success ||
    state === LnPaymentState.SuccessWithReimbursement ||
    state === LnPaymentState.SuccessAfterRetry ||
    state === LnPaymentState.SuccessWithReimbursementAfterRetry
  ) {
    return repo.updateStatus({
      txHash,
      vout,
      from: release.status,
      to: PostMigrationDepositReleaseStatus.Completed,
    })
  }
  if (
    state === LnPaymentState.Failed ||
    state === LnPaymentState.FailedAfterRetry ||
    state === LnPaymentState.FailedAfterSuccess ||
    state === LnPaymentState.FailedAfterSuccessWithReimbursement
  ) {
    const reclaimed = await reclaimTopUp(release)
    if (reclaimed instanceof Error) return reclaimed
    return repo.updateStatus({
      txHash,
      vout,
      from: release.status,
      to: PostMigrationDepositReleaseStatus.Failed,
      failureReason: `ledger payment state: ${state}`,
    })
  }
  return release
}

const splitLightningAddress = (
  lightningAddress: LightningAddress,
): { identifier: string; domain: string } | MigrationInvalidDestinationError => {
  const separator = lightningAddress.lastIndexOf("@")
  if (separator <= 0 || separator === lightningAddress.length - 1) {
    return new MigrationInvalidDestinationError("invalid Lightning address")
  }
  return {
    identifier: lightningAddress.slice(0, separator),
    domain: lightningAddress.slice(separator + 1),
  }
}

const releasePlanMismatch = ({
  release,
  plan,
  caseReference,
}: {
  release: PostMigrationDepositRelease
  plan: PostMigrationDepositReleasePlan
  caseReference: string
}): MigrationStateConflictError | null => {
  const matches =
    release.accountId === plan.account.id &&
    release.walletId === plan.btcWallet.id &&
    release.address === plan.address &&
    release.receiptJournalId === plan.receiptJournalId &&
    release.receiptAmountSats === plan.receiptAmountSats &&
    release.payoutAmountSats === plan.payoutAmountSats &&
    release.plannedTopUpSats === plan.topUpSats &&
    release.lightningAddress === plan.lightningAddress &&
    release.caseReference === caseReference.trim()
  return matches
    ? null
    : new MigrationStateConflictError("stored release does not match current plan")
}

const transferBankOwnerTopUp = async ({
  release,
  amount,
}: {
  release: PostMigrationDepositRelease
  amount: Satoshis
}): Promise<true | ApplicationError> => {
  const bankOwnerWalletId = await getBankOwnerWalletId()
  const bankOwnerWallet = await WalletsRepository().findById(bankOwnerWalletId)
  if (bankOwnerWallet instanceof Error) return bankOwnerWallet
  const bankOwnerAccount = await AccountsRepository().findById(bankOwnerWallet.accountId)
  if (bankOwnerAccount instanceof Error) return bankOwnerAccount

  const result = await intraledgerPaymentSendWalletIdForPostMigrationDepositRelease({
    recipientWalletId: release.walletId,
    amount,
    memo: `post-migration release top-up ${release.caseReference}`,
    senderWalletId: bankOwnerWalletId,
    senderAccount: bankOwnerAccount,
    postMigrationAccountRole: "recipient",
  })
  return result instanceof Error ? result : true
}

const reclaimTopUp = async (
  release: PostMigrationDepositRelease,
): Promise<true | ApplicationError> => {
  if (release.topUpSats <= 0) return true
  const account = await AccountsRepository().findById(release.accountId)
  if (account instanceof Error) return account
  const bankOwnerWalletId = await getBankOwnerWalletId()
  const result = await intraledgerPaymentSendWalletIdForPostMigrationDepositRelease({
    recipientWalletId: bankOwnerWalletId,
    amount: release.topUpSats,
    memo: `post-migration release top-up reclaim ${release.caseReference}`,
    senderWalletId: release.walletId,
    senderAccount: account,
    postMigrationAccountRole: "sender",
  })
  return result instanceof Error ? result : true
}

const failRelease = async (
  release: PostMigrationDepositRelease,
  error: ApplicationError,
): Promise<ApplicationError> => {
  const failed = await PostMigrationDepositReleaseRepository().updateStatus({
    txHash: release.txHash,
    vout: release.vout,
    from: release.status,
    to: PostMigrationDepositReleaseStatus.Failed,
    failureReason: `${error.name}: ${error.message}`,
  })
  return failed instanceof Error ? failed : error
}
