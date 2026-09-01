jest.mock("@/app/accounts/lnurl-server", () => ({
  getLnurlServerService: jest.fn(),
}))
jest.mock("@/app/payments", () => ({
  payInvoiceByWalletId: jest.fn(),
}))
jest.mock("@/app/payments/update-pending-payments", () => ({
  updatePendingPaymentByHash: jest.fn(),
}))
jest.mock("@/app/wallets/get-balance-for-wallet", () => ({
  getBalanceForWallet: jest.fn(),
}))
jest.mock("@/app/migration-flow/complete-post-migration-deposit-release", () => ({
  completePostMigrationDepositRelease: jest.fn(),
}))
jest.mock("@/config", () => ({
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
jest.mock("@/services/lnd", () => ({ LndService: jest.fn() }))
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
import { payInvoiceByWalletId } from "@/app/payments"
import { updatePendingPaymentByHash } from "@/app/payments/update-pending-payments"
import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"
import { completePostMigrationDepositRelease } from "@/app/migration-flow/complete-post-migration-deposit-release"
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
import { UnknownRepositoryError } from "@/domain/errors"
import { checkedToOnChainAddress } from "@/domain/bitcoin/onchain"
import { getBankOwnerWalletId } from "@/services/ledger/caching"
import { LndService } from "@/services/lnd"
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
    updateStatus: jest.Mock
  }
}
const mockReceipt = jest.requireMock("@/services/ledger").__mockReceipt as jest.Mock
const mockTransactions = jest.requireMock("@/services/ledger")
  .__mockTransactions as jest.Mock
const mockBalance = getBalanceForWallet as jest.Mock
const mockGetLnurlServer = getLnurlServerService as jest.Mock
const mockDecodeInvoice = decodeInvoice as jest.Mock
const mockPayInvoice = payInvoiceByWalletId as jest.Mock
const mockLnurlPayService = LnurlPayService as jest.Mock
const mockLndService = LndService as jest.Mock
const mockUpdatePending = updatePendingPaymentByHash as jest.Mock
const mockGetBankOwnerWalletId = getBankOwnerWalletId as jest.Mock
const mockStateDeterminator = LnPaymentStateDeterminator as jest.Mock
const mockCheckedToOnChainAddress = checkedToOnChainAddress as jest.Mock
const mockCompleteRelease = completePostMigrationDepositRelease as jest.Mock

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
  const ownNodePubkey = "03" + "ab".repeat(32)
  const externalNodePubkey = "02" + "77".repeat(32)
  const account = {
    id: accountId,
    status: AccountStatus.Migrated,
    level: AccountLevel.One,
  } as Account
  const bankOwnerAccount = {
    id: bankOwnerAccountId,
    status: AccountStatus.Active,
    level: AccountLevel.Two,
  } as Account
  const btcWallet = {
    id: walletId,
    accountId,
    currency: WalletCurrency.Btc,
    type: WalletType.Checking,
    onChainAddressIdentifiers: [],
    onChainAddresses: () => [],
  } as Wallet
  const bankOwnerWallet = {
    id: bankOwnerWalletId,
    accountId: bankOwnerAccountId,
    currency: WalletCurrency.Btc,
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
  const dependencyError = new UnknownRepositoryError("dependency failed")

  beforeEach(() => {
    jest.clearAllMocks()
    mockCheckedToOnChainAddress.mockImplementation(({ value }) => value)
    mongooseMocks.findAccount.mockImplementation((id) =>
      Promise.resolve(id === bankOwnerAccountId ? bankOwnerAccount : account),
    )
    mongooseMocks.findWallets.mockResolvedValue({
      BTC: { id: walletId, accountId, currency: WalletCurrency.Btc },
      USD: { id: usdWalletId, accountId, currency: WalletCurrency.Usd },
    })
    mongooseMocks.findWallet.mockImplementation((id) =>
      Promise.resolve(id === bankOwnerWalletId ? bankOwnerWallet : btcWallet),
    )
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
    mockLndService.mockReturnValue({ listAllPubkeys: () => [ownNodePubkey] })
    mockLnurlPayService.mockReturnValue({
      fetchInvoiceFromLnAddressOrLnurl: jest.fn().mockResolvedValue("lnbc1fresh"),
    })
    mockCompleteRelease.mockImplementation(({ txHash, vout }) =>
      Promise.resolve(
        processingRelease({
          txHash,
          vout,
          status: PostMigrationDepositReleaseStatus.Completed,
          sweepJournalId: "sweep-journal" as LedgerJournalId,
          sweptAt: new Date(),
        }),
      ),
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
    payoutAmountSats: 1_000 as Satoshis,
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
    mongooseMocks.releaseRepo.updateStatus.mockImplementation(({ to }) =>
      Promise.resolve({ ...bound, status: to }),
    )
    mockDecodeInvoice.mockReturnValue({
      paymentAmount: { amount: BigInt(claimed.payoutAmountSats) },
      paymentHash,
      destination: externalNodePubkey,
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
        payoutAmountSats: 1_000,
        walletBalanceSats: 2_000,
        lightningAddress,
      })
    },
  )

  it("plans a payout exactly equal to the receipt credit", async () => {
    mockReceipt.mockResolvedValueOnce(exactReceipt({ credit: 50 }))

    expect(await inspect()).toMatchObject({
      receiptAmountSats: 50,
      payoutAmountSats: 50,
    })
  })

  it("rejects an address mismatch even when txid and vout exist", async () => {
    mockReceipt.mockResolvedValueOnce(exactReceipt({ address: "bcrt1qdifferent" }))

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

  it("prepares an immutable release without any top-up fields", async () => {
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
        receiptAmountSats: 1_000,
        payoutAmountSats: 1_000,
      }),
    )
    const upsertArgs = mongooseMocks.releaseRepo.upsertPrepared.mock.calls[0][0]
    expect(upsertArgs).not.toHaveProperty("topUpSats")
    expect(upsertArgs).not.toHaveProperty("plannedTopUpSats")
  })

  it("rejects preparing a release that is no longer prepared", async () => {
    mongooseMocks.releaseRepo.upsertPrepared.mockResolvedValue(processingRelease())

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
    mongooseMocks.findAccount.mockImplementation((id) =>
      Promise.resolve(
        id === bankOwnerAccountId
          ? bankOwnerAccount
          : { ...account, status: AccountStatus.Active },
      ),
    )

    const result = await releasePostMigrationDeposit({
      txHash: txHash as OnChainTxHash,
      vout: 2 as OnChainTxVout,
    })

    expect(result).toBeInstanceOf(MigrationStateConflictError)
    expect(mongooseMocks.releaseRepo.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ to: PostMigrationDepositReleaseStatus.Failed }),
    )
    expect(mockPayInvoice).not.toHaveBeenCalled()
  })

  it("retries after an operational reinspection failure", async () => {
    setSuccessfulRelease()
    mongooseMocks.findAccount
      .mockResolvedValueOnce(dependencyError)
      .mockImplementation((id) =>
        Promise.resolve(id === bankOwnerAccountId ? bankOwnerAccount : account),
      )

    const args = {
      txHash: txHash as OnChainTxHash,
      vout: 2 as OnChainTxVout,
    }
    expect(await releasePostMigrationDeposit(args)).toBe(dependencyError)
    expect(mongooseMocks.releaseRepo.updateStatus).not.toHaveBeenCalled()

    expect(await releasePostMigrationDeposit(args)).toMatchObject({
      status: PostMigrationDepositReleaseStatus.Completed,
    })
    expect(mockPayInvoice).toHaveBeenCalledTimes(1)
  })

  it("returns a status persistence failure while failing a release", async () => {
    setSuccessfulRelease()
    mongooseMocks.findAccount.mockImplementation((id) =>
      Promise.resolve(
        id === bankOwnerAccountId
          ? bankOwnerAccount
          : { ...account, status: AccountStatus.Active },
      ),
    )
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
    expect(mockPayInvoice).not.toHaveBeenCalled()
  })

  it("fetches, binds, and pays a fresh invoice from the bankowner wallet", async () => {
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
    expect(mockPayInvoice).toHaveBeenCalledTimes(1)
    expect(mockPayInvoice).toHaveBeenCalledWith({
      uncheckedPaymentRequest: "lnbc1fresh",
      memo: "post-migration deposit release CASE-123",
      senderWalletId: bankOwnerWalletId,
      senderAccount: bankOwnerAccount,
    })
    expect(mockCompleteRelease).toHaveBeenCalledWith({
      txHash,
      vout: 2,
      bankOwnerWalletId,
    })
  })

  it("refuses an invoice whose destination is one of our own nodes", async () => {
    const { paymentHash } = setSuccessfulRelease()
    mockDecodeInvoice.mockReturnValue({
      paymentAmount: { amount: 1_000n },
      paymentHash,
      destination: ownNodePubkey,
    })

    const result = await releasePostMigrationDeposit({
      txHash: txHash as OnChainTxHash,
      vout: 2 as OnChainTxVout,
    })

    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
    expect(mongooseMocks.releaseRepo.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ to: PostMigrationDepositReleaseStatus.Failed }),
    )
    expect(mongooseMocks.releaseRepo.recordPayment).not.toHaveBeenCalled()
    expect(mockPayInvoice).not.toHaveBeenCalled()
  })

  it("leaves the release retryable when the node service is unavailable", async () => {
    setSuccessfulRelease()
    mockLndService.mockReturnValue(dependencyError)

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(dependencyError)
    expect(mockPayInvoice).not.toHaveBeenCalled()
    expect(mongooseMocks.releaseRepo.updateStatus).not.toHaveBeenCalled()
  })

  it("leaves the release retryable when invoice fetching fails", async () => {
    setSuccessfulRelease()
    const fetchInvoice = jest
      .fn()
      .mockResolvedValueOnce(dependencyError)
      .mockResolvedValueOnce("lnbc1fresh")
    mockLnurlPayService.mockReturnValue({
      fetchInvoiceFromLnAddressOrLnurl: fetchInvoice,
    })

    const args = {
      txHash: txHash as OnChainTxHash,
      vout: 2 as OnChainTxVout,
    }
    expect(await releasePostMigrationDeposit(args)).toBe(dependencyError)
    expect(mongooseMocks.releaseRepo.updateStatus).not.toHaveBeenCalled()

    expect(await releasePostMigrationDeposit(args)).toMatchObject({
      status: PostMigrationDepositReleaseStatus.Completed,
    })
    expect(fetchInvoice).toHaveBeenCalledTimes(2)
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
      paymentAmount: { amount: 999n },
      paymentHash,
      destination: externalNodePubkey,
    })

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBeInstanceOf(MigrationInvalidDestinationError)
    expect(mockPayInvoice).not.toHaveBeenCalled()
  })

  it("rejects a changed payment hash for a persisted invoice", async () => {
    const release = processingRelease({
      paymentHash: "cd".repeat(32) as PaymentHash,
      paymentRequest: "lnbc1persisted",
    })
    mongooseMocks.releaseRepo.claimForRelease.mockResolvedValue(release)
    mockDecodeInvoice.mockReturnValue({
      paymentAmount: { amount: 1_000n },
      paymentHash: "ef".repeat(32),
      destination: externalNodePubkey,
    })
    mongooseMocks.releaseRepo.updateStatus.mockResolvedValue(release)

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBeInstanceOf(MigrationStateConflictError)
    expect(mockPayInvoice).not.toHaveBeenCalled()
  })

  it("propagates failure to bind a fresh invoice without paying", async () => {
    setSuccessfulRelease()
    mongooseMocks.releaseRepo.recordPayment.mockResolvedValue(dependencyError)

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(dependencyError)
    expect(mockPayInvoice).not.toHaveBeenCalled()
  })

  it.each<[string, () => void]>([
    [
      "the bankowner wallet lookup fails",
      () =>
        mongooseMocks.findWallet.mockImplementation((id) =>
          Promise.resolve(id === bankOwnerWalletId ? dependencyError : btcWallet),
        ),
    ],
    [
      "the bankowner account lookup fails",
      () =>
        mongooseMocks.findAccount.mockImplementation((id) =>
          Promise.resolve(id === bankOwnerAccountId ? dependencyError : account),
        ),
    ],
  ])("leaves the release retryable when %s", async (_scenario, setup) => {
    setSuccessfulRelease()
    setup()

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(dependencyError)
    expect(mockPayInvoice).not.toHaveBeenCalled()
    expect(mongooseMocks.releaseRepo.updateStatus).not.toHaveBeenCalled()
  })

  it("reconciles an LND success after post-payment bookkeeping fails", async () => {
    const { bound, paymentHash } = setSuccessfulRelease()
    const postPaymentError = new MigrationStateConflictError(
      "LND succeeded but post-payment bookkeeping failed",
    )
    mockPayInvoice.mockResolvedValue(postPaymentError)

    expect(
      await releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(postPaymentError)
    expect(mongooseMocks.releaseRepo.updateStatus).not.toHaveBeenCalled()

    mongooseMocks.releaseRepo.findByOutput.mockResolvedValue(bound)
    mockStateDeterminator.mockReturnValue({ determine: () => LnPaymentState.Success })

    expect(
      await reconcilePostMigrationDepositRelease({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toMatchObject({ status: PostMigrationDepositReleaseStatus.Completed })
    expect(mockUpdatePending).toHaveBeenCalledWith({
      paymentHash,
      logger: {},
    })
    expect(mockCompleteRelease).toHaveBeenCalledWith({
      txHash,
      vout: 2,
      bankOwnerWalletId,
    })
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
      paymentAmount: { amount: 1_000n },
      paymentHash,
      destination: externalNodePubkey,
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
      expect.objectContaining({
        uncheckedPaymentRequest: paymentRequest,
        senderWalletId: bankOwnerWalletId,
      }),
    )
  })

  it("binds a single invoice across concurrent release claims", async () => {
    const paymentHash = "ef".repeat(32) as PaymentHash
    const claimed = processingRelease()
    const bound = { ...claimed, paymentHash, paymentRequest: "lnbc1fresh" }
    mongooseMocks.releaseRepo.claimForRelease
      .mockResolvedValueOnce(claimed)
      .mockResolvedValueOnce(new MigrationStateConflictError("already processing"))
    mongooseMocks.releaseRepo.findByOutput.mockResolvedValue(bound)
    mongooseMocks.releaseRepo.recordPayment.mockResolvedValueOnce(bound)
    mongooseMocks.releaseRepo.updateStatus.mockImplementation(({ to }) =>
      Promise.resolve({ ...bound, status: to }),
    )
    mockDecodeInvoice.mockReturnValue({
      paymentAmount: { amount: 1_000n },
      paymentHash,
      destination: externalNodePubkey,
    })
    mockPayInvoice.mockResolvedValue({ status: PaymentSendStatus.Success })

    const results = await Promise.all([
      releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
      releasePostMigrationDeposit({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ])

    expect(mongooseMocks.releaseRepo.recordPayment).toHaveBeenCalledTimes(1)
    expect(mockLnurlPayService).toHaveBeenCalledTimes(1)
    for (const call of mockPayInvoice.mock.calls) {
      expect(call[0].uncheckedPaymentRequest).toBe("lnbc1fresh")
    }
    expect(results.every((result) => !(result instanceof Error))).toBe(true)
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
    const release = processingRelease({
      status,
      ...(status === PostMigrationDepositReleaseStatus.Completed
        ? {
            sweepJournalId: "sweep-journal" as LedgerJournalId,
            sweptAt: new Date(),
          }
        : {}),
    })
    mongooseMocks.releaseRepo.findByOutput.mockResolvedValue(release)

    expect(
      await reconcilePostMigrationDepositRelease({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toBe(release)
    expect(mockUpdatePending).not.toHaveBeenCalled()
  })

  it("repairs a completed release that predates durable sweep persistence", async () => {
    const release = processingRelease({
      status: PostMigrationDepositReleaseStatus.Completed,
      paymentHash: "ef".repeat(32) as PaymentHash,
    })
    mongooseMocks.releaseRepo.findByOutput.mockResolvedValue(release)

    expect(
      await reconcilePostMigrationDepositRelease({
        txHash: txHash as OnChainTxHash,
        vout: 2 as OnChainTxVout,
      }),
    ).toMatchObject({
      status: PostMigrationDepositReleaseStatus.Completed,
      sweepJournalId: "sweep-journal",
    })
    expect(mockCompleteRelease).toHaveBeenCalledWith({
      txHash,
      vout: 2,
      bankOwnerWalletId,
    })
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
