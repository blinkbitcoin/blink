jest.mock("@/app/migration-flow/execute-transfer", () => ({
  migrationDrainPlan: jest.fn(() => ({ amount: 990n, residualTopUp: 0n })),
  reserveForAmount: jest.fn(() => 10n),
}))
jest.mock("@/app/accounts/lnurl-server", () => ({
  getLnurlServerService: jest.fn(),
}))
jest.mock("@/app/payments/send-intraledger", () => ({
  intraledgerPaymentSendWalletIdForPostMigrationDepositRelease: jest.fn(),
}))
jest.mock("@/app/payments/send-lightning", () => ({
  payInvoiceByWalletIdForPostMigrationDepositRelease: jest.fn(),
}))
jest.mock("@/app/payments/update-pending-payments", () => ({
  updatePendingPaymentByHash: jest.fn(),
}))
jest.mock("@/app/wallets/get-balance-for-wallet", () => ({
  getBalanceForWallet: jest.fn(),
}))
jest.mock("@/config", () => ({
  getSkipFeeReimbursement: jest.fn(() => true),
  getCustodialMigrationFlowConfig: jest.fn(() => ({
    deMinimisThresholdSats: 100,
  })),
  LNURL_SERVER_LN_ADDRESS_DOMAIN: "wallet.example",
  NETWORK: "regtest",
}))
jest.mock("@/domain/bitcoin/onchain", () => ({
  checkedToOnChainAddress: jest.fn(({ value }) => value as OnChainAddress),
}))
jest.mock("@/services/ledger", () => ({
  __mockReceipt: jest.fn(),
  LedgerService: () => ({
    getOnChainReceiptForWallet: jest.requireMock("@/services/ledger").__mockReceipt,
  }),
}))
jest.mock("@/services/mongoose", () => ({
  __mocks: {
    findAccount: jest.fn(),
    findWallets: jest.fn(),
    findWallet: jest.fn(),
    findMigration: jest.fn(),
    releaseRepo: {
      findByOutput: jest.fn(),
      upsertPrepared: jest.fn(),
      claimForRelease: jest.fn(),
      recordPayment: jest.fn(),
      recordTopUp: jest.fn(),
      updateStatus: jest.fn(),
    },
  },
  AccountsRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findAccount,
  }),
  WalletsRepository: () => ({
    findAccountWalletsByAccountId:
      jest.requireMock("@/services/mongoose").__mocks.findWallets,
    findById: jest.requireMock("@/services/mongoose").__mocks.findWallet,
  }),
  MigrationFlowStateRepository: () => ({
    findByAccountId: jest.requireMock("@/services/mongoose").__mocks.findMigration,
  }),
  PostMigrationDepositReleaseRepository: () =>
    jest.requireMock("@/services/mongoose").__mocks.releaseRepo,
}))
jest.mock("@/services/lnurl-pay", () => ({ LnurlPayService: jest.fn() }))
jest.mock("@/services/logger", () => ({ baseLogger: {} }))
jest.mock("@/domain/bitcoin/lightning", () => ({
  ...jest.requireActual("@/domain/bitcoin/lightning"),
  decodeInvoice: jest.fn(),
}))

import { getLnurlServerService } from "@/app/accounts/lnurl-server"
import {
  inspectPostMigrationDepositRelease,
  releasePostMigrationDeposit,
} from "@/app/migration-flow/post-migration-deposit-release"
import { payInvoiceByWalletIdForPostMigrationDepositRelease } from "@/app/payments/send-lightning"
import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"
import { AccountLevel, AccountStatus } from "@/domain/accounts"
import { decodeInvoice, PaymentSendStatus } from "@/domain/bitcoin/lightning"
import { LedgerTransactionType } from "@/domain/ledger"
import {
  MigrationFlowPhase,
  MigrationInvalidDestinationError,
  PostMigrationDepositReleaseStatus,
  MigrationStateConflictError,
} from "@/domain/migration-flow"
import { WalletCurrency } from "@/domain/shared"
import { WalletType } from "@/domain/wallets"
import { LnurlPayService } from "@/services/lnurl-pay"

const mongooseMocks = jest.requireMock("@/services/mongoose").__mocks as {
  findAccount: jest.Mock
  findWallets: jest.Mock
  findWallet: jest.Mock
  findMigration: jest.Mock
  releaseRepo: {
    findByOutput: jest.Mock
    upsertPrepared: jest.Mock
    claimForRelease: jest.Mock
    recordPayment: jest.Mock
    recordTopUp: jest.Mock
    updateStatus: jest.Mock
  }
}
const mockReceipt = jest.requireMock("@/services/ledger").__mockReceipt as jest.Mock
const mockBalance = getBalanceForWallet as jest.Mock
const mockGetLnurlServer = getLnurlServerService as jest.Mock
const mockDecodeInvoice = decodeInvoice as jest.Mock
const mockPayInvoice = payInvoiceByWalletIdForPostMigrationDepositRelease as jest.Mock
const mockLnurlPayService = LnurlPayService as jest.Mock

describe("inspectPostMigrationDepositRelease", () => {
  const accountId = "11111111-1111-4111-8111-111111111111" as AccountId
  const walletId = "22222222-2222-4222-8222-222222222222" as WalletId
  const usdWalletId = "33333333-3333-4333-8333-333333333333" as WalletId
  const txHash = "ab".repeat(32)
  const address = "bcrt1qhistoricaladdress"
  const lightningAddress = "alice@wallet.example"
  const sparkPubkey = "02" + "cd".repeat(32)
  const account = {
    id: accountId,
    status: AccountStatus.Migrated,
    level: AccountLevel.One,
  } as Account
  const btcWallet = {
    id: walletId,
    accountId,
    currency: WalletCurrency.Btc,
    type: WalletType.Checking,
    onChainAddressIdentifiers: [],
    onChainAddresses: () => [],
  } as Wallet

  beforeEach(() => {
    jest.clearAllMocks()
    mongooseMocks.findAccount.mockResolvedValue(account)
    mongooseMocks.findWallets.mockResolvedValue({
      BTC: { id: walletId, accountId, currency: WalletCurrency.Btc },
      USD: { id: usdWalletId, accountId, currency: WalletCurrency.Usd },
    })
    mongooseMocks.findWallet.mockResolvedValue(btcWallet)
    mongooseMocks.findMigration.mockResolvedValue({
      accountId,
      phase: MigrationFlowPhase.Completed,
      destinationProofVerified: true,
      destinationSparkPubkey: sparkPubkey,
    })
    mockGetLnurlServer.mockReturnValue({
      getIdentifier: jest.fn().mockResolvedValue({
        provider: "spark",
        providerDetails: { sparkPubkey },
      }),
    })
    mockReceipt.mockResolvedValue({
      type: LedgerTransactionType.OnchainReceipt,
      pendingConfirmation: false,
      walletId,
      currency: WalletCurrency.Btc,
      txHash,
      vout: 2,
      address,
      journalId: "journal-id",
      credit: 1_000,
    })
    mockBalance.mockImplementation(({ walletId: id }) =>
      Promise.resolve(id === usdWalletId ? 0 : 2_000),
    )
  })

  const inspect = () =>
    inspectPostMigrationDepositRelease({
      accountId,
      txHash,
      vout: 2,
      address,
      lightningAddress,
    })

  const processingRelease = (
    overrides: Partial<PostMigrationDepositRelease> = {},
  ): PostMigrationDepositRelease => ({
    accountId,
    walletId,
    txHash: txHash as OnChainTxHash,
    vout: 2 as OnChainTxVout,
    address: address as OnChainAddress,
    receiptJournalId: "journal-id" as LedgerJournalId,
    receiptAmountSats: 1_000 as Satoshis,
    payoutAmountSats: 990 as Satoshis,
    plannedTopUpSats: 0 as Satoshis,
    topUpSats: 0 as Satoshis,
    lightningAddress: lightningAddress as LightningAddress,
    caseReference: "CASE-123",
    status: PostMigrationDepositReleaseStatus.Processing,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  })

  it.each([AccountStatus.Migrated, AccountStatus.Closed])(
    "accepts a settled exact-output receipt for a %s account",
    async (status) => {
      mongooseMocks.findAccount.mockResolvedValue({ ...account, status })

      const result = await inspect()

      expect(result).toMatchObject({
        txHash,
        vout: 2,
        receiptAmountSats: 1_000,
        payoutAmountSats: 990,
        walletBalanceSats: 2_000,
        lightningAddress,
      })
    },
  )

  it("pays the full receipt and plans the configured reserve below de minimis", async () => {
    mockReceipt.mockResolvedValueOnce({
      type: LedgerTransactionType.OnchainReceipt,
      pendingConfirmation: false,
      walletId,
      currency: WalletCurrency.Btc,
      txHash,
      vout: 2,
      address,
      journalId: "journal-id",
      credit: 50,
    })

    expect(await inspect()).toMatchObject({
      receiptAmountSats: 50,
      payoutAmountSats: 50,
      topUpSats: 10,
    })
  })

  it("rejects an address mismatch even when txid and vout exist", async () => {
    mockReceipt.mockResolvedValueOnce({
      type: LedgerTransactionType.OnchainReceipt,
      pendingConfirmation: false,
      walletId,
      currency: WalletCurrency.Btc,
      txHash,
      vout: 2,
      address: "bcrt1qdifferent",
      journalId: "journal-id",
      credit: 1_000,
    })

    expect(await inspect()).toBeInstanceOf(MigrationStateConflictError)
  })

  it("rejects a Lightning address mapped to another Spark key", async () => {
    mockGetLnurlServer.mockReturnValueOnce({
      getIdentifier: jest.fn().mockResolvedValue({
        provider: "spark",
        providerDetails: { sparkPubkey: "02" + "ef".repeat(32) },
      }),
    })

    expect(await inspect()).toBeInstanceOf(MigrationInvalidDestinationError)
  })

  it("rejects when the current wallet balance cannot cover the receipt credit", async () => {
    mockBalance.mockImplementation(({ walletId: id }) =>
      Promise.resolve(id === usdWalletId ? 0 : 999),
    )

    expect(await inspect()).toBeInstanceOf(MigrationStateConflictError)
  })

  it("reuses the bound invoice when resuming a processing release", async () => {
    const paymentHash = "ef".repeat(32) as PaymentHash
    const paymentRequest = "lnbc1persisted"
    const release = processingRelease({
      paymentHash,
      paymentRequest,
    })
    mongooseMocks.releaseRepo.claimForRelease.mockResolvedValue(
      new MigrationStateConflictError("already processing"),
    )
    mongooseMocks.releaseRepo.findByOutput.mockResolvedValue(release)
    mockDecodeInvoice.mockReturnValue({
      paymentAmount: { amount: 990n },
      paymentHash,
    })
    mockPayInvoice.mockResolvedValue({ status: PaymentSendStatus.Success })
    mongooseMocks.releaseRepo.updateStatus.mockResolvedValue({
      ...release,
      status: PostMigrationDepositReleaseStatus.Completed,
    })

    const result = await releasePostMigrationDeposit({
      txHash: txHash as OnChainTxHash,
      vout: 2 as OnChainTxVout,
    })

    expect(result).toMatchObject({
      status: PostMigrationDepositReleaseStatus.Completed,
    })
    expect(mockLnurlPayService).not.toHaveBeenCalled()
    expect(mongooseMocks.releaseRepo.recordPayment).not.toHaveBeenCalled()
    expect(mockPayInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ uncheckedPaymentRequest: paymentRequest }),
    )
  })

  it("stops a resumed release when the planned top-up state is ambiguous", async () => {
    const release = processingRelease({
      paymentHash: "ef".repeat(32) as PaymentHash,
      paymentRequest: "lnbc1persisted",
      plannedTopUpSats: 1 as Satoshis,
    })
    mongooseMocks.releaseRepo.claimForRelease.mockResolvedValue(
      new MigrationStateConflictError("already processing"),
    )
    mongooseMocks.releaseRepo.findByOutput.mockResolvedValue(release)

    const result = await releasePostMigrationDeposit({
      txHash: txHash as OnChainTxHash,
      vout: 2 as OnChainTxVout,
    })

    expect(result).toBeInstanceOf(MigrationStateConflictError)
    expect(mockDecodeInvoice).not.toHaveBeenCalled()
    expect(mockPayInvoice).not.toHaveBeenCalled()
  })
})
