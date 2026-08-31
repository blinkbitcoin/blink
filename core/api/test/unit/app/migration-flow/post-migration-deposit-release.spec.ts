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
  __mockTransactions: jest.fn(),
  LedgerService: () => ({
    getOnChainReceiptForWallet: jest.requireMock("@/services/ledger").__mockReceipt,
    getTransactionsByHash: jest.requireMock("@/services/ledger").__mockTransactions,
  }),
}))
jest.mock("@/services/ledger/caching", () => ({ getBankOwnerWalletId: jest.fn() }))
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
jest.mock("@/domain/ledger/ln-payment-state", () => ({
  LnPaymentState: {
    Pending: "PENDING",
    Success: "SUCCESS",
    SuccessWithReimbursement: "SUCCESS_WITH_REIMBURSEMENT",
    SuccessAfterRetry: "SUCCESS_AFTER_RETRY",
    SuccessWithReimbursementAfterRetry: "SUCCESS_WITH_REIMBURSEMENT_AFTER_RETRY",
    Failed: "FAILED",
    FailedAfterRetry: "FAILED_AFTER_RETRY",
    FailedAfterSuccess: "FAILED_AFTER_SUCCESS",
    FailedAfterSuccessWithReimbursement: "FAILED_AFTER_SUCCESS_WITH_REIMBURSEMENT",
  },
  LnPaymentStateDeterminator: jest.fn(),
}))
jest.mock("@/domain/bitcoin/lightning", () => ({
  ...jest.requireActual("@/domain/bitcoin/lightning"),
  decodeInvoice: jest.fn(),
}))

import { getLnurlServerService } from "@/app/accounts/lnurl-server"
import {
  inspectPostMigrationDepositRelease,
  preparePostMigrationDepositRelease,
  reconcilePostMigrationDepositRelease,
  releasePostMigrationDeposit,
} from "@/app/migration-flow/post-migration-deposit-release"
import { migrationDrainPlan } from "@/app/migration-flow/execute-transfer"
import { intraledgerPaymentSendWalletIdForPostMigrationDepositRelease } from "@/app/payments/send-intraledger"
import { payInvoiceByWalletIdForPostMigrationDepositRelease } from "@/app/payments/send-lightning"
import { updatePendingPaymentByHash } from "@/app/payments/update-pending-payments"
import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"
import { getSkipFeeReimbursement } from "@/config"
import { AccountLevel, AccountStatus } from "@/domain/accounts"
import { decodeInvoice, PaymentSendStatus } from "@/domain/bitcoin/lightning"
import { LedgerTransactionType } from "@/domain/ledger"
import {
  LnPaymentState,
  LnPaymentStateDeterminator,
} from "@/domain/ledger/ln-payment-state"
import {
  MigrationFlowPhase,
  MigrationInvalidDestinationError,
  PostMigrationDepositReleaseStatus,
  MigrationStateConflictError,
} from "@/domain/migration-flow"
import { WalletCurrency } from "@/domain/shared"
import { WalletType } from "@/domain/wallets"
import { checkedToOnChainAddress } from "@/domain/bitcoin/onchain"
import { getBankOwnerWalletId } from "@/services/ledger/caching"
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
const mockTransactions = jest.requireMock("@/services/ledger")
  .__mockTransactions as jest.Mock
const mockBalance = getBalanceForWallet as jest.Mock
const mockGetLnurlServer = getLnurlServerService as jest.Mock
const mockDecodeInvoice = decodeInvoice as jest.Mock
const mockPayInvoice = payInvoiceByWalletIdForPostMigrationDepositRelease as jest.Mock
const mockLnurlPayService = LnurlPayService as jest.Mock
const mockIntraledger =
  intraledgerPaymentSendWalletIdForPostMigrationDepositRelease as jest.Mock
const mockUpdatePending = updatePendingPaymentByHash as jest.Mock
const mockGetBankOwnerWalletId = getBankOwnerWalletId as jest.Mock
const mockStateDeterminator = LnPaymentStateDeterminator as jest.Mock
const mockSkipFeeReimbursement = getSkipFeeReimbursement as jest.Mock
const mockCheckedToOnChainAddress = checkedToOnChainAddress as jest.Mock
const mockMigrationDrainPlan = migrationDrainPlan as jest.Mock

describe("inspectPostMigrationDepositRelease", () => {
  const accountId = "11111111-1111-4111-8111-111111111111" as AccountId
  const walletId = "22222222-2222-4222-8222-222222222222" as WalletId
  const usdWalletId = "33333333-3333-4333-8333-333333333333" as WalletId
  const bankOwnerWalletId = "44444444-4444-4444-8444-444444444444" as WalletId
  const bankOwnerAccountId = "55555555-5555-4555-8555-555555555555" as AccountId
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
  const exactReceipt = (overrides: Record<string, unknown> = {}) => ({
    type: LedgerTransactionType.OnchainReceipt,
    pendingConfirmation: false,
    walletId,
    currency: WalletCurrency.Btc,
    txHash,
    vout: 2,
    address,
    journalId: "journal-id",
    credit: 1_000,
    ...overrides,
  })
  const dependencyError = new MigrationStateConflictError("dependency failed")

  beforeEach(() => {
    jest.clearAllMocks()
    mockSkipFeeReimbursement.mockReturnValue(true)
    mockCheckedToOnChainAddress.mockImplementation(({ value }) => value)
    mockMigrationDrainPlan.mockReturnValue({ amount: 990n, residualTopUp: 0n })
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
    mockReceipt.mockResolvedValue(exactReceipt())
    mockBalance.mockImplementation(({ walletId: id }) =>
      Promise.resolve(id === usdWalletId ? 0 : 2_000),
    )
    mockTransactions.mockResolvedValue([])
    mockStateDeterminator.mockReturnValue({ determine: () => LnPaymentState.Pending })
    mockUpdatePending.mockResolvedValue(true)
    mockGetBankOwnerWalletId.mockResolvedValue(bankOwnerWalletId)
    mockIntraledger.mockResolvedValue({ status: PaymentSendStatus.Success })
    mockLnurlPayService.mockReturnValue({
      fetchInvoiceFromLnAddressOrLnurl: jest.fn().mockResolvedValue("lnbc1fresh"),
    })
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

  const setSuccessfulRelease = (overrides: Partial<PostMigrationDepositRelease> = {}) => {
    const paymentHash = "ef".repeat(32) as PaymentHash
    const claimed = processingRelease(overrides)
    const bound = {
      ...claimed,
      paymentHash,
      paymentRequest: claimed.paymentRequest ?? "lnbc1fresh",
    }
    mongooseMocks.releaseRepo.claimForRelease.mockResolvedValue(claimed)
    mongooseMocks.releaseRepo.recordPayment.mockResolvedValue(bound)
    mongooseMocks.releaseRepo.recordTopUp.mockResolvedValue(bound)
    mongooseMocks.releaseRepo.updateStatus.mockImplementation(({ to }) =>
      Promise.resolve({ ...bound, status: to }),
    )
    mockDecodeInvoice.mockReturnValue({
      paymentAmount: { amount: BigInt(claimed.payoutAmountSats) },
      paymentHash,
    })
    mockPayInvoice.mockResolvedValue({ status: PaymentSendStatus.Success })
    return { claimed, bound, paymentHash }
  }

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

  it.each<[string, () => void]>([
    [
      "fee reimbursement is enabled",
      () => mockSkipFeeReimbursement.mockReturnValue(false),
    ],
    [
      "the account id is invalid",
      () => mongooseMocks.findAccount.mockImplementation(() => undefined),
    ],
    ["the transaction hash is invalid", () => undefined],
    ["the vout is negative", () => undefined],
    ["the vout is unsafe", () => undefined],
    [
      "the address is invalid",
      () => mockCheckedToOnChainAddress.mockReturnValue(dependencyError),
    ],
    ["the Lightning address is invalid", () => undefined],
    [
      "the account lookup fails",
      () => mongooseMocks.findAccount.mockResolvedValue(dependencyError),
    ],
    [
      "the account is not post-migration",
      () =>
        mongooseMocks.findAccount.mockResolvedValue({
          ...account,
          status: AccountStatus.Active,
        }),
    ],
    [
      "the wallet lookup fails",
      () => mongooseMocks.findWallets.mockResolvedValue(dependencyError),
    ],
    [
      "the BTC wallet lookup fails",
      () => mongooseMocks.findWallet.mockResolvedValue(dependencyError),
    ],
    [
      "the BTC wallet belongs to another account",
      () =>
        mongooseMocks.findWallet.mockResolvedValue({
          ...btcWallet,
          accountId: bankOwnerAccountId,
        }),
    ],
    [
      "the USD balance lookup fails",
      () => mockBalance.mockResolvedValue(dependencyError),
    ],
    [
      "the USD balance is nonzero",
      () =>
        mockBalance.mockImplementation(({ walletId: id }) =>
          Promise.resolve(id === usdWalletId ? 1 : 2_000),
        ),
    ],
    [
      "the migration lookup fails",
      () => mongooseMocks.findMigration.mockResolvedValue(dependencyError),
    ],
    [
      "the migration is incomplete",
      () =>
        mongooseMocks.findMigration.mockResolvedValue({
          phase: MigrationFlowPhase.InProgress,
          destinationProofVerified: true,
          destinationSparkPubkey: sparkPubkey,
        }),
    ],
    [
      "the destination proof is absent",
      () =>
        mongooseMocks.findMigration.mockResolvedValue({
          phase: MigrationFlowPhase.Completed,
          destinationProofVerified: false,
          destinationSparkPubkey: sparkPubkey,
        }),
    ],
    [
      "the destination key is absent",
      () =>
        mongooseMocks.findMigration.mockResolvedValue({
          phase: MigrationFlowPhase.Completed,
          destinationProofVerified: true,
        }),
    ],
    ["the LNURL server is absent", () => mockGetLnurlServer.mockReturnValue(null)],
    [
      "the identifier lookup fails",
      () =>
        mockGetLnurlServer.mockReturnValue({
          getIdentifier: jest.fn().mockResolvedValue(dependencyError),
        }),
    ],
    [
      "the identifier provider is not Spark",
      () =>
        mockGetLnurlServer.mockReturnValue({
          getIdentifier: jest.fn().mockResolvedValue({
            provider: "lnd",
            providerDetails: {},
          }),
        }),
    ],
    [
      "the Spark identifier has no key",
      () =>
        mockGetLnurlServer.mockReturnValue({
          getIdentifier: jest.fn().mockResolvedValue({
            provider: "spark",
            providerDetails: {},
          }),
        }),
    ],
    ["the receipt lookup fails", () => mockReceipt.mockResolvedValue(dependencyError)],
    ["the receipt is absent", () => mockReceipt.mockResolvedValue(undefined)],
    [
      "the receipt has zero credit",
      () => mockReceipt.mockResolvedValue(exactReceipt({ credit: 0 })),
    ],
    [
      "the drain plan fails",
      () => mockMigrationDrainPlan.mockReturnValue(dependencyError),
    ],
    [
      "the BTC balance lookup fails",
      () =>
        mockBalance.mockImplementation(({ walletId: id }) =>
          Promise.resolve(id === usdWalletId ? 0 : dependencyError),
        ),
    ],
  ])("rejects when %s", async (scenario, setup) => {
    setup()
    const raw = {
      accountId,
      txHash,
      vout: 2,
      address,
      lightningAddress,
    }
    if (scenario === "the account id is invalid") raw.accountId = "invalid" as AccountId
    if (scenario === "the transaction hash is invalid") raw.txHash = "invalid"
    if (scenario === "the vout is negative") raw.vout = -1
    if (scenario === "the vout is unsafe") raw.vout = Number.MAX_SAFE_INTEGER + 1
    if (scenario === "the Lightning address is invalid") raw.lightningAddress = "invalid"
    if (scenario === "the LNURL server is absent") raw.lightningAddress = lightningAddress

    expect(await inspectPostMigrationDepositRelease(raw)).toBeInstanceOf(Error)
  })

  it("rejects a Lightning address on another domain", async () => {
    expect(
      await inspectPostMigrationDepositRelease({
        accountId,
        txHash,
        vout: 2,
        address,
        lightningAddress: "alice@other.example",
      }),
    ).toBeInstanceOf(MigrationInvalidDestinationError)
  })

  it.each([
    { type: "not-receipt" },
    { pendingConfirmation: true },
    { walletId: bankOwnerWalletId },
    { currency: WalletCurrency.Usd },
    { txHash: "cd".repeat(32) },
    { vout: 3 },
    { address: "bcrt1qother" },
  ])("rejects mismatched receipt evidence %#", async (overrides) => {
    mockReceipt.mockResolvedValue(exactReceipt(overrides))

    expect(await inspect()).toBeInstanceOf(MigrationStateConflictError)
  })

  it("requires a nonblank case reference before preparing", async () => {
    const result = await preparePostMigrationDepositRelease({
      accountId,
      txHash,
      vout: 2,
      address,
      lightningAddress,
      caseReference: "   ",
    })

    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
    expect(mongooseMocks.releaseRepo.upsertPrepared).not.toHaveBeenCalled()
  })

  it("propagates inspection failure while preparing", async () => {
    const result = await preparePostMigrationDepositRelease({
      accountId,
      txHash: "invalid",
      vout: 2,
      address,
      lightningAddress,
      caseReference: "CASE-123",
    })

    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
  })

  it("prepares an immutable release and trims its case reference", async () => {
    const prepared = processingRelease({
      status: PostMigrationDepositReleaseStatus.Prepared,
    })
    mongooseMocks.releaseRepo.upsertPrepared.mockResolvedValue(prepared)

    const result = await preparePostMigrationDepositRelease({
      accountId,
      txHash,
      vout: 2,
      address,
      lightningAddress,
      caseReference: "  CASE-123  ",
    })

    expect(result).toEqual(prepared)
    expect(mongooseMocks.releaseRepo.upsertPrepared).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        walletId,
        caseReference: "CASE-123",
        topUpSats: 0,
      }),
    )
  })

  it("propagates persistence failure while preparing", async () => {
    mongooseMocks.releaseRepo.upsertPrepared.mockResolvedValue(dependencyError)

    expect(
      await preparePostMigrationDepositRelease({
        accountId,
        txHash,
        vout: 2,
        address,
        lightningAddress,
        caseReference: "CASE-123",
      }),
    ).toBe(dependencyError)
  })

  it("rejects a prepared record that differs from the current plan", async () => {
    mongooseMocks.releaseRepo.upsertPrepared.mockResolvedValue(
      processingRelease({
        status: PostMigrationDepositReleaseStatus.Prepared,
        receiptJournalId: "other-journal" as LedgerJournalId,
      }),
    )

    expect(
      await preparePostMigrationDepositRelease({
        accountId,
        txHash,
        vout: 2,
        address,
        lightningAddress,
        caseReference: "CASE-123",
      }),
    ).toBeInstanceOf(MigrationStateConflictError)
  })

  it("returns the claim failure when no resumable release exists", async () => {
    mongooseMocks.releaseRepo.claimForRelease.mockResolvedValue(dependencyError)
    mongooseMocks.releaseRepo.findByOutput.mockResolvedValue(
      new MigrationInvalidDestinationError("not found"),
    )

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(dependencyError)
  })

  it("returns the claim failure when the existing release is not processing", async () => {
    mongooseMocks.releaseRepo.claimForRelease.mockResolvedValue(dependencyError)
    mongooseMocks.releaseRepo.findByOutput.mockResolvedValue(
      processingRelease({ status: PostMigrationDepositReleaseStatus.Prepared }),
    )

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(dependencyError)
  })

  it("marks the release failed when reinspection fails", async () => {
    setSuccessfulRelease()
    mockSkipFeeReimbursement.mockReturnValue(false)

    const result = await releasePostMigrationDeposit({
      txHash: txHash as OnChainTxHash,
      vout: 2 as OnChainTxVout,
    })

    expect(result).toBeInstanceOf(MigrationStateConflictError)
    expect(mongooseMocks.releaseRepo.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ to: PostMigrationDepositReleaseStatus.Failed }),
    )
  })

  it("returns a status persistence failure while failing a release", async () => {
    setSuccessfulRelease()
    mockSkipFeeReimbursement.mockReturnValue(false)
    mongooseMocks.releaseRepo.updateStatus.mockResolvedValue(dependencyError)

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(dependencyError)
  })

  it("marks the release failed when its stored plan no longer matches", async () => {
    setSuccessfulRelease({ receiptJournalId: "other-journal" as LedgerJournalId })

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBeInstanceOf(MigrationStateConflictError)
  })

  it("fetches, binds, and pays a fresh invoice", async () => {
    const { paymentHash } = setSuccessfulRelease()

    const result = await releasePostMigrationDeposit({
      txHash: txHash as OnChainTxHash,
      vout: 2 as OnChainTxVout,
    })

    expect(result).toMatchObject({ status: PostMigrationDepositReleaseStatus.Completed })
    expect(mongooseMocks.releaseRepo.recordPayment).toHaveBeenCalledWith({
      txHash,
      vout: 2,
      paymentHash,
      paymentRequest: "lnbc1fresh",
    })
  })

  it("rejects a nonpositive planned payout before fetching an invoice", async () => {
    mockMigrationDrainPlan.mockReturnValue({ amount: 0n, residualTopUp: 0n })
    setSuccessfulRelease({ payoutAmountSats: 0 as Satoshis })

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBeInstanceOf(Error)
  })

  it("marks the release failed when invoice fetching fails", async () => {
    setSuccessfulRelease()
    mockLnurlPayService.mockReturnValue({
      fetchInvoiceFromLnAddressOrLnurl: jest.fn().mockResolvedValue(dependencyError),
    })

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(dependencyError)
  })

  it("marks the release failed when invoice decoding fails", async () => {
    setSuccessfulRelease()
    mockDecodeInvoice.mockReturnValue(dependencyError)

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(dependencyError)
  })

  it("rejects an invoice whose amount differs from the plan", async () => {
    const { paymentHash } = setSuccessfulRelease()
    mockDecodeInvoice.mockReturnValue({
      paymentAmount: { amount: 989n },
      paymentHash,
    })

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBeInstanceOf(MigrationInvalidDestinationError)
  })

  it("rejects a changed payment hash for a persisted invoice", async () => {
    const release = processingRelease({
      paymentHash: "cd".repeat(32) as PaymentHash,
      paymentRequest: "lnbc1persisted",
    })
    mongooseMocks.releaseRepo.claimForRelease.mockResolvedValue(release)
    mockDecodeInvoice.mockReturnValue({
      paymentAmount: { amount: 990n },
      paymentHash: "ef".repeat(32),
    })
    mongooseMocks.releaseRepo.updateStatus.mockResolvedValue(release)

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBeInstanceOf(MigrationStateConflictError)
  })

  it("propagates failure to bind a fresh invoice", async () => {
    setSuccessfulRelease()
    mongooseMocks.releaseRepo.recordPayment.mockResolvedValue(dependencyError)

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(dependencyError)
  })

  it("tops up, records, and pays a below-de-minimis release", async () => {
    mockReceipt.mockResolvedValue(exactReceipt({ credit: 50 }))
    const { bound } = setSuccessfulRelease({
      receiptAmountSats: 50 as Satoshis,
      payoutAmountSats: 50 as Satoshis,
      plannedTopUpSats: 10 as Satoshis,
    })
    mongooseMocks.findWallet.mockResolvedValueOnce(btcWallet).mockResolvedValueOnce({
      id: bankOwnerWalletId,
      accountId: bankOwnerAccountId,
      currency: WalletCurrency.Btc,
    })
    mongooseMocks.findAccount
      .mockResolvedValueOnce(account)
      .mockResolvedValueOnce({ ...account, id: bankOwnerAccountId })
    mongooseMocks.releaseRepo.recordTopUp.mockResolvedValue({
      ...bound,
      topUpSats: 10 as Satoshis,
    })

    const result = await releasePostMigrationDeposit({
      txHash: txHash as OnChainTxHash,
      vout: 2 as OnChainTxVout,
    })

    expect(result).toMatchObject({ status: PostMigrationDepositReleaseStatus.Completed })
    expect(mockIntraledger).toHaveBeenCalledWith(
      expect.objectContaining({
        senderWalletId: bankOwnerWalletId,
        recipientWalletId: walletId,
        postMigrationAccountRole: "recipient",
      }),
    )
  })

  it.each<[string, () => void]>([
    [
      "bankowner wallet lookup",
      () =>
        mongooseMocks.findWallet
          .mockResolvedValueOnce(btcWallet)
          .mockResolvedValueOnce(dependencyError),
    ],
    [
      "bankowner account lookup",
      () =>
        mongooseMocks.findAccount
          .mockResolvedValueOnce(account)
          .mockResolvedValueOnce(dependencyError),
    ],
    ["bankowner transfer", () => mockIntraledger.mockResolvedValue(dependencyError)],
  ])("marks the release failed when %s fails", async (_scenario, setup) => {
    mockReceipt.mockResolvedValue(exactReceipt({ credit: 50 }))
    setSuccessfulRelease({
      receiptAmountSats: 50 as Satoshis,
      payoutAmountSats: 50 as Satoshis,
      plannedTopUpSats: 10 as Satoshis,
    })
    setup()

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(dependencyError)
  })

  it("propagates failure to record a completed top-up", async () => {
    mockReceipt.mockResolvedValue(exactReceipt({ credit: 50 }))
    setSuccessfulRelease({
      receiptAmountSats: 50 as Satoshis,
      payoutAmountSats: 50 as Satoshis,
      plannedTopUpSats: 10 as Satoshis,
    })
    mongooseMocks.releaseRepo.recordTopUp.mockResolvedValue(dependencyError)

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(dependencyError)
  })

  it("marks a failed payment failed when no top-up needs reclaiming", async () => {
    setSuccessfulRelease()
    mockPayInvoice.mockResolvedValue(dependencyError)

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(dependencyError)
  })

  it("reclaims a recorded top-up after payment failure", async () => {
    mockReceipt.mockResolvedValue(exactReceipt({ credit: 50 }))
    setSuccessfulRelease({
      receiptAmountSats: 50 as Satoshis,
      payoutAmountSats: 50 as Satoshis,
      plannedTopUpSats: 10 as Satoshis,
      topUpSats: 10 as Satoshis,
    })
    mockPayInvoice.mockResolvedValue(dependencyError)

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(dependencyError)
    expect(mockIntraledger).toHaveBeenCalledWith(
      expect.objectContaining({
        senderWalletId: walletId,
        recipientWalletId: bankOwnerWalletId,
        postMigrationAccountRole: "sender",
      }),
    )
  })

  it("returns an account lookup failure while reclaiming a top-up", async () => {
    mockReceipt.mockResolvedValue(exactReceipt({ credit: 50 }))
    setSuccessfulRelease({
      receiptAmountSats: 50 as Satoshis,
      payoutAmountSats: 50 as Satoshis,
      plannedTopUpSats: 10 as Satoshis,
      topUpSats: 10 as Satoshis,
    })
    mockPayInvoice.mockResolvedValue(dependencyError)
    mongooseMocks.findAccount
      .mockResolvedValueOnce(account)
      .mockResolvedValueOnce(dependencyError)

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(dependencyError)
  })

  it("returns a transfer failure while reclaiming a top-up", async () => {
    mockReceipt.mockResolvedValue(exactReceipt({ credit: 50 }))
    setSuccessfulRelease({
      receiptAmountSats: 50 as Satoshis,
      payoutAmountSats: 50 as Satoshis,
      plannedTopUpSats: 10 as Satoshis,
      topUpSats: 10 as Satoshis,
    })
    mockPayInvoice.mockResolvedValue(new MigrationInvalidDestinationError("payment"))
    mockIntraledger.mockResolvedValue(dependencyError)

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(dependencyError)
  })

  it("records a non-successful payment as pending", async () => {
    setSuccessfulRelease()
    mockPayInvoice.mockResolvedValue({ status: PaymentSendStatus.Pending })

    const result = await releasePostMigrationDeposit({
      txHash: txHash as OnChainTxHash,
      vout: 2 as OnChainTxVout,
    })

    expect(result).toMatchObject({ status: PostMigrationDepositReleaseStatus.Pending })
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
    mockReceipt.mockResolvedValue(exactReceipt({ credit: 50 }))
    const release = processingRelease({
      paymentHash: "ef".repeat(32) as PaymentHash,
      paymentRequest: "lnbc1persisted",
      receiptAmountSats: 50 as Satoshis,
      payoutAmountSats: 50 as Satoshis,
      plannedTopUpSats: 10 as Satoshis,
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

  it("propagates a release lookup failure during reconciliation", async () => {
    mongooseMocks.releaseRepo.findByOutput.mockResolvedValue(dependencyError)

    expect(
      await reconcilePostMigrationDepositRelease({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(dependencyError)
  })

  it.each([
    PostMigrationDepositReleaseStatus.Completed,
    PostMigrationDepositReleaseStatus.Failed,
  ])("returns an already terminal %s release", async (status) => {
    const release = processingRelease({ status })
    mongooseMocks.releaseRepo.findByOutput.mockResolvedValue(release)

    expect(
      await reconcilePostMigrationDepositRelease({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(release)
    expect(mockUpdatePending).not.toHaveBeenCalled()
  })

  it("rejects reconciliation without a bound payment hash", async () => {
    mongooseMocks.releaseRepo.findByOutput.mockResolvedValue(processingRelease())

    expect(
      await reconcilePostMigrationDepositRelease({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBeInstanceOf(MigrationStateConflictError)
  })

  it("propagates pending-payment reconciliation failure", async () => {
    mongooseMocks.releaseRepo.findByOutput.mockResolvedValue(
      processingRelease({ paymentHash: "ef".repeat(32) as PaymentHash }),
    )
    mockUpdatePending.mockResolvedValue(dependencyError)

    expect(
      await reconcilePostMigrationDepositRelease({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(dependencyError)
  })

  it("propagates ledger lookup failure during reconciliation", async () => {
    mongooseMocks.releaseRepo.findByOutput.mockResolvedValue(
      processingRelease({ paymentHash: "ef".repeat(32) as PaymentHash }),
    )
    mockTransactions.mockResolvedValue(dependencyError)

    expect(
      await reconcilePostMigrationDepositRelease({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(dependencyError)
  })

  it("propagates an invalid ledger payment state", async () => {
    mongooseMocks.releaseRepo.findByOutput.mockResolvedValue(
      processingRelease({ paymentHash: "ef".repeat(32) as PaymentHash }),
    )
    mockStateDeterminator.mockReturnValue({ determine: () => dependencyError })

    expect(
      await reconcilePostMigrationDepositRelease({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(dependencyError)
  })

  it.each([
    LnPaymentState.Success,
    LnPaymentState.SuccessWithReimbursement,
    LnPaymentState.SuccessAfterRetry,
    LnPaymentState.SuccessWithReimbursementAfterRetry,
  ])("marks ledger state %s completed", async (state) => {
    const release = processingRelease({
      status: PostMigrationDepositReleaseStatus.Pending,
      paymentHash: "ef".repeat(32) as PaymentHash,
    })
    mongooseMocks.releaseRepo.findByOutput.mockResolvedValue(release)
    mockStateDeterminator.mockReturnValue({ determine: () => state })
    mongooseMocks.releaseRepo.updateStatus.mockResolvedValue({
      ...release,
      status: PostMigrationDepositReleaseStatus.Completed,
    })

    expect(
      await reconcilePostMigrationDepositRelease({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toMatchObject({ status: PostMigrationDepositReleaseStatus.Completed })
  })

  it.each([
    LnPaymentState.Failed,
    LnPaymentState.FailedAfterRetry,
    LnPaymentState.FailedAfterSuccess,
    LnPaymentState.FailedAfterSuccessWithReimbursement,
  ])("marks ledger state %s failed", async (state) => {
    const release = processingRelease({
      status: PostMigrationDepositReleaseStatus.Pending,
      paymentHash: "ef".repeat(32) as PaymentHash,
    })
    mongooseMocks.releaseRepo.findByOutput.mockResolvedValue(release)
    mockStateDeterminator.mockReturnValue({ determine: () => state })
    mongooseMocks.releaseRepo.updateStatus.mockResolvedValue({
      ...release,
      status: PostMigrationDepositReleaseStatus.Failed,
    })

    expect(
      await reconcilePostMigrationDepositRelease({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toMatchObject({ status: PostMigrationDepositReleaseStatus.Failed })
  })

  it("returns a top-up reclaim failure while reconciling a failed payment", async () => {
    const release = processingRelease({
      status: PostMigrationDepositReleaseStatus.Pending,
      paymentHash: "ef".repeat(32) as PaymentHash,
      topUpSats: 10 as Satoshis,
    })
    mongooseMocks.releaseRepo.findByOutput.mockResolvedValue(release)
    mockStateDeterminator.mockReturnValue({ determine: () => LnPaymentState.Failed })
    mockIntraledger.mockResolvedValue(dependencyError)

    expect(
      await reconcilePostMigrationDepositRelease({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(dependencyError)
  })

  it("leaves an indeterminate ledger state pending", async () => {
    const release = processingRelease({
      status: PostMigrationDepositReleaseStatus.Pending,
      paymentHash: "ef".repeat(32) as PaymentHash,
    })
    mongooseMocks.releaseRepo.findByOutput.mockResolvedValue(release)
    mockStateDeterminator.mockReturnValue({ determine: () => LnPaymentState.Pending })

    expect(
      await reconcilePostMigrationDepositRelease({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(release)
  })
})
