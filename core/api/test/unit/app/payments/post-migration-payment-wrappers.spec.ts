jest.mock("@/config", () => ({
  getValuesToSkipProbe: jest.fn(() => []),
  getWindDownConfig: jest.fn(() => ({ convertUsdToBtcAtMidPrice: false })),
}))

jest.mock("@/app/payments/helpers", () => ({
  constructPaymentFlowBuilder: jest.fn(),
  getPriceRatioForLimits: jest.fn(),
}))

jest.mock("@/domain/payments", () => ({
  ...jest.requireActual("@/domain/payments"),
  LightningPaymentFlowBuilder: jest.fn(() => ({
    withoutInvoice: jest.fn(() => ({
      withSenderWalletAndAccount: jest.fn(() => ({})),
    })),
  })),
}))

jest.mock("@/domain/bitcoin/lightning", () => ({
  ...jest.requireActual("@/domain/bitcoin/lightning"),
  decodeInvoice: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: {
    findWalletById: jest.fn(),
    findAccountWalletsByAccountId: jest.fn(),
    findAccountById: jest.fn(),
    findUserById: jest.fn(),
    findLightningPaymentFlow: jest.fn(),
    persistNewPaymentFlow: jest.fn(),
  },
  WalletsRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findWalletById,
    findAccountWalletsByAccountId:
      jest.requireMock("@/services/mongoose").__mocks.findAccountWalletsByAccountId,
  }),
  AccountsRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findAccountById,
  }),
  UsersRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findUserById,
  }),
  PaymentFlowStateRepository: () => ({
    findLightningPaymentFlow:
      jest.requireMock("@/services/mongoose").__mocks.findLightningPaymentFlow,
    persistNew: jest.requireMock("@/services/mongoose").__mocks.persistNewPaymentFlow,
  }),
}))

jest.mock("@/services/ledger/caching", () => ({ getBankOwnerWalletId: jest.fn() }))
jest.mock("@/app/wallets", () => ({
  validateIsBtcWallet: jest.fn(),
  validateIsUsdWallet: jest.fn(),
  getTransactionForWalletByJournalId: jest.fn(),
  getTransactionsForWalletByPaymentHash: jest.fn(),
}))
jest.mock("@/app/wind-down", () => ({
  checkReceiveAllowed: jest.fn().mockResolvedValue(true),
  isAccountInWindDownCohort: jest.fn().mockResolvedValue(false),
}))
jest.mock("@/app/wind-down/check-receive-allowed", () => ({
  checkReceiveAllowed: jest.fn().mockResolvedValue(true),
}))
jest.mock("@/app/accounts", () => ({ createIntraledgerContact: jest.fn() }))
jest.mock("@/app/prices", () => ({
  btcFromUsdMidPriceFn: jest.fn(),
  usdFromBtcMidPriceFn: jest.fn(),
  getCurrentPriceAsDisplayPriceRatio: jest.fn(),
}))
jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: jest.fn(),
  recordExceptionInCurrentSpan: jest.fn(),
  wrapAsyncToRunInSpan: ({ fn }: { fn: unknown }) => fn,
  wrapAsyncFunctionsToRunInSpan: ({ fns }: { fns: unknown }) => fns,
}))
jest.mock("@/services/dealer-price", () => ({
  DealerPriceService: () => ({
    getCentsFromSatsForImmediateBuy: jest.fn(),
    getSatsFromCentsForImmediateBuy: jest.fn(),
    getCentsFromSatsForImmediateSell: jest.fn(),
    getSatsFromCentsForImmediateSell: jest.fn(),
  }),
}))
jest.mock("@/services/lock", () => ({ LockService: () => ({}) }))
jest.mock("@/services/ledger", () => ({ LedgerService: () => ({}) }))
jest.mock("@/services/ledger/facade", () => ({}))
jest.mock("@/services/notifications", () => ({ NotificationsService: () => ({}) }))
jest.mock("@/services/lnd", () => ({ LndService: () => ({}) }))

import { intraledgerPaymentSendWalletIdForPostMigrationDepositRelease } from "@/app/payments/send-intraledger"
import { getPriceRatioForLimits } from "@/app/payments/helpers"
import { payInvoiceByWalletIdForPostMigrationDepositRelease } from "@/app/payments/send-lightning"
import { validateIsBtcWallet } from "@/app/wallets"
import { AccountStatus } from "@/domain/accounts"
import { decodeInvoice } from "@/domain/bitcoin/lightning"
import { UnknownRepositoryError } from "@/domain/errors"
import { InvalidLightningPaymentFlowBuilderStateError } from "@/domain/payments"
import { WalletCurrency } from "@/domain/shared"
import { SettlementMethod, WalletType } from "@/domain/wallets"
import { getBankOwnerWalletId } from "@/services/ledger/caching"

const mocks = jest.requireMock("@/services/mongoose").__mocks as {
  findWalletById: jest.Mock
  findAccountWalletsByAccountId: jest.Mock
  findAccountById: jest.Mock
  findUserById: jest.Mock
  findLightningPaymentFlow: jest.Mock
  persistNewPaymentFlow: jest.Mock
}
const mockGetBankOwnerWalletId = getBankOwnerWalletId as jest.Mock
const mockValidateIsBtcWallet = validateIsBtcWallet as jest.Mock
const mockDecodeInvoice = decodeInvoice as jest.Mock
const mockGetPriceRatioForLimits = getPriceRatioForLimits as jest.Mock

const bankOwnerAccountId = "11111111-1111-4111-8111-111111111111" as AccountId
const migratedAccountId = "22222222-2222-4222-8222-222222222222" as AccountId
const otherAccountId = "33333333-3333-4333-8333-333333333333" as AccountId
const bankOwnerWalletId = "44444444-4444-4444-8444-444444444444" as WalletId
const migratedWalletId = "55555555-5555-4555-8555-555555555555" as WalletId

const account = (id: AccountId, status: AccountStatus): Account =>
  ({
    id,
    status,
    kratosUserId: `user-${id}` as UserId,
    displayCurrency: "USD" as DisplayCurrency,
  }) as Account

const wallet = (id: WalletId, accountId: AccountId): Wallet =>
  ({
    id,
    accountId,
    currency: WalletCurrency.Btc,
    type: WalletType.Checking,
    onChainAddressIdentifiers: [],
    onChainAddresses: () => [],
  }) as Wallet

const bankOwnerAccount = account(bankOwnerAccountId, AccountStatus.Active)
const migratedAccount = account(migratedAccountId, AccountStatus.Migrated)
const bankOwnerWallet = wallet(bankOwnerWalletId, bankOwnerAccountId)
const migratedWallet = wallet(migratedWalletId, migratedAccountId)
const pastValidation = new UnknownRepositoryError("past validation")

describe("post-migration payment wrappers", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetBankOwnerWalletId.mockResolvedValue(bankOwnerWalletId)
    mockValidateIsBtcWallet.mockResolvedValue(true)
    mocks.findWalletById.mockImplementation(async (id: WalletId) =>
      id === bankOwnerWalletId ? bankOwnerWallet : migratedWallet,
    )
    mocks.findAccountById.mockImplementation(async (id: AccountId) =>
      id === bankOwnerAccountId ? bankOwnerAccount : migratedAccount,
    )
    mocks.findUserById.mockResolvedValue({ phone: undefined })
    mocks.findAccountWalletsByAccountId.mockResolvedValue(pastValidation)
    mockDecodeInvoice.mockReturnValue({
      paymentAmount: { amount: 100n },
      paymentHash: "ab".repeat(32),
      destination: "02" + "cd".repeat(32),
      description: "release",
    })
  })

  it.each([0, -1, 11])("rejects an out-of-range top-up of %s sats", async (amount) => {
    expect(
      await intraledgerPaymentSendWalletIdForPostMigrationDepositRelease({
        senderWalletId: bankOwnerWalletId,
        senderAccount: bankOwnerAccount,
        recipientWalletId: migratedWalletId,
        amount: amount as Satoshis,
        memo: null,
        postMigrationAccountRole: "recipient",
      }),
    ).toBeInstanceOf(InvalidLightningPaymentFlowBuilderStateError)
  })

  it.each([
    ["recipient", migratedWalletId, migratedWalletId],
    ["sender", migratedWalletId, migratedWalletId],
  ] as const)("requires bankowner for the %s role", async (role, from, to) => {
    expect(
      await intraledgerPaymentSendWalletIdForPostMigrationDepositRelease({
        senderWalletId: from,
        senderAccount: migratedAccount,
        recipientWalletId: to,
        amount: 1 as Satoshis,
        memo: null,
        postMigrationAccountRole: role,
      }),
    ).toBeInstanceOf(InvalidLightningPaymentFlowBuilderStateError)
  })

  it("propagates BTC wallet validation failure", async () => {
    mockValidateIsBtcWallet.mockResolvedValue(pastValidation)

    expect(
      await intraledgerPaymentSendWalletIdForPostMigrationDepositRelease({
        senderWalletId: bankOwnerWalletId,
        senderAccount: bankOwnerAccount,
        recipientWalletId: migratedWalletId,
        amount: 1 as Satoshis,
        memo: null,
        postMigrationAccountRole: "recipient",
      }),
    ).toBe(pastValidation)
  })

  it.each([
    ["recipient", bankOwnerWalletId, bankOwnerAccount, migratedWalletId],
    ["sender", migratedWalletId, migratedAccount, bankOwnerWalletId],
  ] as const)(
    "validates the post-migration %s account before continuing",
    async (role, from, senderAccount, to) => {
      expect(
        await intraledgerPaymentSendWalletIdForPostMigrationDepositRelease({
          senderWalletId: from,
          senderAccount,
          recipientWalletId: to,
          amount: 1 as Satoshis,
          memo: null,
          postMigrationAccountRole: role,
        }),
      ).toBe(pastValidation)
    },
  )

  it("rejects a caller-supplied account that does not own the sender wallet", async () => {
    expect(
      await intraledgerPaymentSendWalletIdForPostMigrationDepositRelease({
        senderWalletId: migratedWalletId,
        senderAccount: account(otherAccountId, AccountStatus.Migrated),
        recipientWalletId: bankOwnerWalletId,
        amount: 1 as Satoshis,
        memo: null,
        postMigrationAccountRole: "sender",
      }),
    ).toBeInstanceOf(InvalidLightningPaymentFlowBuilderStateError)
  })

  it("propagates BTC validation failure for Lightning release", async () => {
    mockValidateIsBtcWallet.mockResolvedValue(pastValidation)

    expect(
      await payInvoiceByWalletIdForPostMigrationDepositRelease({
        uncheckedPaymentRequest: "lnbc1release",
        memo: null,
        senderWalletId: migratedWalletId,
        senderAccount: migratedAccount,
      }),
    ).toBe(pastValidation)
  })

  it("rejects an active account for a post-migration Lightning release", async () => {
    mocks.findAccountById.mockResolvedValue(bankOwnerAccount)

    expect(
      await payInvoiceByWalletIdForPostMigrationDepositRelease({
        uncheckedPaymentRequest: "lnbc1release",
        memo: null,
        senderWalletId: migratedWalletId,
        senderAccount: migratedAccount,
      }),
    ).toBeInstanceOf(Error)
  })

  it("rejects a caller-supplied Lightning sender account mismatch", async () => {
    expect(
      await payInvoiceByWalletIdForPostMigrationDepositRelease({
        uncheckedPaymentRequest: "lnbc1release",
        memo: null,
        senderWalletId: migratedWalletId,
        senderAccount: account(otherAccountId, AccountStatus.Migrated),
      }),
    ).toBeInstanceOf(InvalidLightningPaymentFlowBuilderStateError)
  })

  it("rejects an intraledger invoice for a post-migration release", async () => {
    mocks.findLightningPaymentFlow.mockResolvedValue({
      settlementMethod: SettlementMethod.IntraLedger,
      btcPaymentAmount: { amount: 100n },
      recipientWalletDescriptor: () => undefined,
    })

    expect(
      await payInvoiceByWalletIdForPostMigrationDepositRelease({
        uncheckedPaymentRequest: "lnbc1release",
        memo: null,
        senderWalletId: migratedWalletId,
        senderAccount: migratedAccount,
      }),
    ).toBeInstanceOf(InvalidLightningPaymentFlowBuilderStateError)
  })

  it("enters the Lightning path with spending checks bypassed", async () => {
    mocks.findLightningPaymentFlow.mockResolvedValue({
      settlementMethod: SettlementMethod.Lightning,
      btcPaymentAmount: { amount: 100n },
      usdPaymentAmount: { amount: 1n },
      recipientWalletDescriptor: () => undefined,
      senderWalletDescriptor: () => ({ id: migratedWalletId }),
      paymentAmounts: () => ({}),
    })
    mockGetPriceRatioForLimits.mockResolvedValue(pastValidation)

    expect(
      await payInvoiceByWalletIdForPostMigrationDepositRelease({
        uncheckedPaymentRequest: "lnbc1release",
        memo: null,
        senderWalletId: migratedWalletId,
        senderAccount: migratedAccount,
      }),
    ).toBe(pastValidation)
  })
})
