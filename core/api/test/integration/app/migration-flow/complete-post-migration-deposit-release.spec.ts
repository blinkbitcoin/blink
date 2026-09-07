import { randomBytes } from "crypto"

import { completePostMigrationDepositRelease } from "@/app/migration-flow/complete-post-migration-deposit-release"
import { toSats } from "@/domain/bitcoin"
import { LedgerTransactionType } from "@/domain/ledger"
import { PostMigrationDepositReleaseStatus } from "@/domain/migration-flow"
import {
  BtcPaymentAmount,
  BtcWalletDescriptor,
  ZERO_CENTS,
  ZERO_SATS,
} from "@/domain/shared"
import { LedgerService } from "@/services/ledger"
import { getBankOwnerWalletId } from "@/services/ledger/caching"
import { MainBook } from "@/services/ledger/books"
import { lndLedgerAccountId } from "@/services/ledger/domain"
import * as LedgerFacade from "@/services/ledger/facade"
import { PostMigrationDepositReleaseRepository } from "@/services/mongoose"

import { createMandatoryUsers } from "test/helpers"

describe("completePostMigrationDepositRelease", () => {
  beforeAll(async () => {
    await createMandatoryUsers()
  })

  it("sweeps exactly the bound vout once before completing", async () => {
    const walletId = crypto.randomUUID() as WalletId
    const accountId = crypto.randomUUID() as AccountId
    const bankOwnerWalletId = await getBankOwnerWalletId()
    const txHash = randomBytes(32).toString("hex") as OnChainTxHash
    const address = "bcrt1qpostmigrationrelease" as OnChainAddress
    const receiptAmountSats = toSats(1_000)
    const unrelatedAmountSats = toSats(700)

    const receiptJournal = await recordReceipt({
      walletId,
      txHash,
      vout: 0 as OnChainTxVout,
      address,
      amountSats: receiptAmountSats,
    })
    const unrelatedJournal = await recordReceipt({
      walletId,
      txHash,
      vout: 1 as OnChainTxVout,
      address,
      amountSats: unrelatedAmountSats,
    })

    const translatedVoutZero = await LedgerService().getOnChainReceiptForWallet({
      walletId,
      txHash,
      vout: 0 as OnChainTxVout,
    })
    if (!translatedVoutZero || translatedVoutZero instanceof Error) {
      throw translatedVoutZero ?? new Error("receipt not found")
    }
    expect(translatedVoutZero.vout).toBe(0)

    const repo = PostMigrationDepositReleaseRepository()
    const prepared = await repo.upsertPrepared({
      accountId,
      walletId,
      txHash,
      vout: 0 as OnChainTxVout,
      address,
      receiptJournalId: receiptJournal.journalId,
      receiptAmountSats,
      payoutAmountSats: receiptAmountSats,
      lightningAddress: "alice@wallet.example" as LightningAddress,
      caseReference: `CASE-${crypto.randomUUID()}`,
    })
    if (prepared instanceof Error) throw prepared
    const claimed = await repo.claimForRelease({
      txHash,
      vout: 0 as OnChainTxVout,
    })
    if (claimed instanceof Error) throw claimed
    const bound = await repo.recordPayment({
      txHash,
      vout: 0 as OnChainTxVout,
      paymentHash: "cd".repeat(32) as PaymentHash,
      paymentRequest: "lnbc1bound",
    })
    if (bound instanceof Error) throw bound

    const customerBefore = await LedgerService().getWalletBalance(walletId)
    const bankOwnerBefore = await LedgerService().getWalletBalance(bankOwnerWalletId)
    const lndBefore = await MainBook.balance({ account: lndLedgerAccountId })
    if (customerBefore instanceof Error) throw customerBefore
    if (bankOwnerBefore instanceof Error) throw bankOwnerBefore

    const results = await Promise.all([
      completePostMigrationDepositRelease({
        txHash,
        vout: 0 as OnChainTxVout,
        bankOwnerWalletId,
      }),
      completePostMigrationDepositRelease({
        txHash,
        vout: 0 as OnChainTxVout,
        bankOwnerWalletId,
      }),
    ])
    for (const result of results) {
      if (result instanceof Error) throw result
      expect(result.status).toBe(PostMigrationDepositReleaseStatus.Completed)
      expect(result.sweepJournalId).toBeDefined()
      expect(result.sweptAt).toBeInstanceOf(Date)
    }

    const customerAfter = await LedgerService().getWalletBalance(walletId)
    const bankOwnerAfter = await LedgerService().getWalletBalance(bankOwnerWalletId)
    const lndAfter = await MainBook.balance({ account: lndLedgerAccountId })
    if (customerAfter instanceof Error) throw customerAfter
    if (bankOwnerAfter instanceof Error) throw bankOwnerAfter

    expect(customerBefore - customerAfter).toBe(receiptAmountSats)
    expect(bankOwnerAfter - bankOwnerBefore).toBe(receiptAmountSats)
    expect(lndAfter.balance).toBe(lndBefore.balance)
    expect(customerAfter).toBe(unrelatedAmountSats)

    const unrelatedReceipt = await LedgerService().getTransactionForWalletByJournalId({
      walletId,
      journalId: unrelatedJournal.journalId,
    })
    if (unrelatedReceipt instanceof Error) throw unrelatedReceipt
    expect(unrelatedReceipt).toMatchObject({
      type: LedgerTransactionType.OnchainReceipt,
      credit: unrelatedAmountSats,
      vout: 1,
    })

    const customerTransactions = await LedgerService().getTransactionsByWalletId(walletId)
    if (customerTransactions instanceof Error) throw customerTransactions
    expect(
      customerTransactions.filter((tx) => tx.externalId?.startsWith("pmdr_")),
    ).toHaveLength(1)
  })
})

const recordReceipt = async ({
  walletId,
  txHash,
  vout,
  address,
  amountSats,
}: {
  walletId: WalletId
  txHash: OnChainTxHash
  vout: OnChainTxVout
  address: OnChainAddress
  amountSats: Satoshis
}): Promise<LedgerJournal> => {
  const amount = BtcPaymentAmount(BigInt(amountSats))
  const {
    metadata,
    creditAccountAdditionalMetadata,
    internalAccountsAdditionalMetadata,
  } = LedgerFacade.OnChainReceiveLedgerMetadata({
    onChainTxHash: txHash,
    onChainTxVout: vout,
    paymentAmounts: {
      btcPaymentAmount: amount,
      usdPaymentAmount: ZERO_CENTS,
      btcProtocolAndBankFee: ZERO_SATS,
      usdProtocolAndBankFee: ZERO_CENTS,
    },
    feeDisplayCurrency: 0 as DisplayCurrencyBaseAmount,
    amountDisplayCurrency: 0 as DisplayCurrencyBaseAmount,
    displayCurrency: "USD" as DisplayCurrency,
    payeeAddresses: [address],
    newAddressRequestId: undefined,
  })
  const journal = await LedgerFacade.recordReceiveOnChain({
    description: `receipt ${txHash}:${vout}`,
    recipientWalletDescriptor: BtcWalletDescriptor(walletId),
    amountToCreditReceiver: { btc: amount, usd: ZERO_CENTS },
    bankFee: { btc: ZERO_SATS, usd: ZERO_CENTS },
    metadata,
    additionalCreditMetadata: creditAccountAdditionalMetadata,
    additionalInternalMetadata: internalAccountsAdditionalMetadata,
  })
  if (journal instanceof Error) throw journal
  return journal
}
