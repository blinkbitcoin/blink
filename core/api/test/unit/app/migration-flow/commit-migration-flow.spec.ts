jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  getCustodialMigrationFlowConfig: jest.fn(),
}))

jest.mock("@/app/migration-flow/execute-transfer", () => ({
  executeMigrationTransfer: jest.fn(),
}))

jest.mock("@/app/migration-flow/resume-migration-flow", () => ({
  resumeMigrationFlow: jest.fn(),
}))

jest.mock("@/app/accounts/lnurl-server", () => ({
  __mocks: {
    transferIdentifierToSpark: jest.fn(),
  },
  getLnurlServerService: () => ({
    transferIdentifierToSpark: jest.requireMock("@/app/accounts/lnurl-server").__mocks
      .transferIdentifierToSpark,
  }),
}))

jest.mock("@/app/wallets/get-balance-for-wallet", () => ({
  getBalanceForWallet: jest.fn(),
}))

jest.mock("@/services/lnd", () => ({
  __mockListAllPubkeys: jest.fn(),
  LndService: () => ({
    listAllPubkeys: jest.requireMock("@/services/lnd").__mockListAllPubkeys,
  }),
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: {
    findAccountById: jest.fn(),
    findFlowByAccountId: jest.fn(),
    updateFlowPhase: jest.fn(),
    findAccountWalletsByAccountId: jest.fn(),
  },
  AccountsRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findAccountById,
  }),
  MigrationFlowStateRepository: () => ({
    findByAccountId: jest.requireMock("@/services/mongoose").__mocks.findFlowByAccountId,
    updatePhase: jest.requireMock("@/services/mongoose").__mocks.updateFlowPhase,
  }),
  WalletsRepository: () => ({
    findAccountWalletsByAccountId:
      jest.requireMock("@/services/mongoose").__mocks.findAccountWalletsByAccountId,
  }),
}))

import { createHash } from "crypto"

import { createSignedRequest, createUnsignedRequest } from "invoices"
import * as ecc from "tiny-secp256k1"

import { commitMigrationFlow } from "@/app/migration-flow/commit-migration-flow"
import { executeMigrationTransfer } from "@/app/migration-flow/execute-transfer"
import { resumeMigrationFlow } from "@/app/migration-flow/resume-migration-flow"
import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"
import { AccountStatus } from "@/domain/accounts"
import {
  decodeInvoice,
  RouteNotFoundError,
  PaymentSendStatus,
} from "@/domain/bitcoin/lightning"
import {
  CouldNotFindMigrationFlowStateError,
  InactiveAccountError,
} from "@/domain/errors"
import {
  buildMigrationProofChallenge,
  MigrationApiKeyForbiddenError,
  MigrationDollarBalanceNotEmptyError,
  MigrationFlowDisabledError,
  MigrationFlowPhase,
  MigrationInvalidDestinationError,
  MigrationProofExpiredError,
  MigrationStateConflictError,
} from "@/domain/migration-flow"
import { getCustodialMigrationFlowConfig } from "@/config"

const nodePrivateKey = Buffer.alloc(32, 13)
const nodePubkey = Buffer.from(
  ecc.pointFromScalar(nodePrivateKey, true) as Uint8Array,
).toString("hex")

const buildInvoice = ({
  seed,
  tokens,
  createdAt,
  expiresAt,
}: {
  seed: number
  tokens?: number
  createdAt?: Date
  expiresAt?: Date
}): string => {
  const id = createHash("sha256").update(Buffer.alloc(32, seed)).digest("hex")
  const unsigned = createUnsignedRequest({
    ...(createdAt ? { created_at: createdAt.toISOString() } : {}),
    description: "",
    destination: nodePubkey,
    ...(expiresAt ? { expires_at: expiresAt.toISOString() } : {}),
    features: [],
    id,
    network: "bitcoin",
    payment: Buffer.alloc(32, seed + 100).toString("hex"),
    ...(tokens !== undefined ? { tokens } : {}),
  })
  const signature = Buffer.from(
    ecc.sign(Buffer.from(unsigned.hash, "hex"), nodePrivateKey),
  ).toString("hex")
  const { request } = createSignedRequest({
    destination: nodePubkey,
    hrp: unsigned.hrp,
    signature,
    tags: unsigned.tags,
  })
  return request
}

const noAmountPaymentRequest = buildInvoice({ seed: 1 })
const amountPaymentRequest = buildInvoice({ seed: 2, tokens: 21000 })
const expiredPaymentRequest = buildInvoice({
  seed: 3,
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  expiresAt: new Date(Date.now() - 60 * 60 * 1000),
})

const decodedNoAmountInvoice = decodeInvoice(noAmountPaymentRequest)
if (decodedNoAmountInvoice instanceof Error) throw decodedNoAmountInvoice
const noAmountPaymentHash = decodedNoAmountInvoice.paymentHash

const privateKey = Buffer.alloc(32, 7)
const sparkPubkey = Buffer.from(
  ecc.pointFromScalar(privateKey, true) as Uint8Array,
).toString("hex")

const accountId = "account-id" as AccountId

const signProof = (timestamp: number): string => {
  const digest = createHash("sha256")
    .update(
      Buffer.from(
        buildMigrationProofChallenge({
          accountId,
          destinationPubkey: sparkPubkey as SparkPubkey,
          timestamp,
        }),
        "utf8",
      ),
    )
    .digest()
  return Buffer.from(ecc.sign(digest, privateKey)).toString("hex")
}

const mocks = jest.requireMock("@/services/mongoose").__mocks as {
  findAccountById: jest.Mock
  findFlowByAccountId: jest.Mock
  updateFlowPhase: jest.Mock
  findAccountWalletsByAccountId: jest.Mock
}
const mockListAllPubkeys = jest.requireMock("@/services/lnd")
  .__mockListAllPubkeys as jest.Mock
const mockGetConfig = getCustodialMigrationFlowConfig as jest.Mock
const mockGetBalanceForWallet = getBalanceForWallet as jest.Mock
const mockExecuteMigrationTransfer = executeMigrationTransfer as jest.Mock
const mockResumeMigrationFlow = resumeMigrationFlow as jest.Mock
const mockTransferIdentifierToSpark = jest.requireMock("@/app/accounts/lnurl-server")
  .__mocks.transferIdentifierToSpark as jest.Mock

describe("commitMigrationFlow", () => {
  const account = { id: accountId, status: AccountStatus.Active } as Account
  const accountWallets = {
    BTC: { id: "btc-wallet-id" as WalletId },
    USD: { id: "usd-wallet-id" as WalletId },
  }
  const inProgressFlow = {
    accountId,
    phase: MigrationFlowPhase.InProgress,
    destinationProofVerified: false,
    steps: [],
  } as unknown as MigrationFlow
  const transferringFlow = {
    ...inProgressFlow,
    phase: MigrationFlowPhase.Transferring,
    destinationSparkPubkey: sparkPubkey as SparkPubkey,
    destinationProofVerified: true,
    lnPaymentHash: noAmountPaymentHash,
  } as MigrationFlow

  const commitArgs = () => ({
    accountId,
    sparkPubkey,
    proofTimestamp: Math.floor(Date.now() / 1000),
    sparkInvoice: noAmountPaymentRequest,
    disclosureVersion: "v1",
    backupAttested: true,
  })

  const validCommitArgs = () => {
    const args = commitArgs()
    return { ...args, proofSignature: signProof(args.proofTimestamp) }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetConfig.mockReturnValue({ enabled: true })
    mocks.findAccountById.mockResolvedValue(account)
    mocks.findFlowByAccountId.mockResolvedValue(inProgressFlow)
    mocks.updateFlowPhase.mockResolvedValue(transferringFlow)
    mocks.findAccountWalletsByAccountId.mockResolvedValue(accountWallets)
    mockListAllPubkeys.mockReturnValue([])
    mockGetBalanceForWallet.mockResolvedValue(0)
    mockExecuteMigrationTransfer.mockResolvedValue(PaymentSendStatus.Pending)
  })

  it("returns MigrationFlowDisabledError when the feature flag is off", async () => {
    mockGetConfig.mockReturnValue({ enabled: false })

    const result = await commitMigrationFlow(validCommitArgs())

    expect(result).toBeInstanceOf(MigrationFlowDisabledError)
    expect(mockExecuteMigrationTransfer).not.toHaveBeenCalled()
  })

  it("refuses an API-key caller before touching any state or drain", async () => {
    const result = await commitMigrationFlow({
      ...validCommitArgs(),
      apiKeyId: "api-key-id" as ApiKeyId,
    })

    expect(result).toBeInstanceOf(MigrationApiKeyForbiddenError)
    expect(mocks.findAccountById).not.toHaveBeenCalled()
    expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
    expect(mockExecuteMigrationTransfer).not.toHaveBeenCalled()
  })

  it("reconciles an in-flight transfer via the resume path", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(transferringFlow)
    mockResumeMigrationFlow.mockResolvedValue(transferringFlow)

    const result = await commitMigrationFlow(validCommitArgs())

    expect(result).toBe(transferringFlow)
    expect(mockResumeMigrationFlow).toHaveBeenCalledTimes(1)
    expect(mockExecuteMigrationTransfer).not.toHaveBeenCalled()
  })

  it("rejects when the backup is not attested", async () => {
    const result = await commitMigrationFlow({
      ...validCommitArgs(),
      backupAttested: false,
    })

    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
    expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
    expect(mockExecuteMigrationTransfer).not.toHaveBeenCalled()
  })

  it("rejects an empty disclosure version", async () => {
    const result = await commitMigrationFlow({
      ...validCommitArgs(),
      disclosureVersion: "  ",
    })

    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
    expect((result as Error).message).toBe("disclosure version required")
    expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
    expect(mockExecuteMigrationTransfer).not.toHaveBeenCalled()
  })

  it("returns InactiveAccountError for a non-active account", async () => {
    mocks.findAccountById.mockResolvedValue({
      id: accountId,
      status: AccountStatus.Locked,
    } as Account)

    const result = await commitMigrationFlow(validCommitArgs())

    expect(result).toBeInstanceOf(InactiveAccountError)
    expect(mockExecuteMigrationTransfer).not.toHaveBeenCalled()
  })

  it("rejects an amount-bearing invoice without initiating a payment", async () => {
    const result = await commitMigrationFlow({
      ...validCommitArgs(),
      sparkInvoice: amountPaymentRequest,
    })

    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
    expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
    expect(mockExecuteMigrationTransfer).not.toHaveBeenCalled()
  })

  it("rejects a commit when the migration has not been started", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(
      new CouldNotFindMigrationFlowStateError(accountId),
    )

    const result = await commitMigrationFlow(validCommitArgs())

    expect(result).toBeInstanceOf(MigrationStateConflictError)
    expect((result as Error).message).toBe("migration has not been started")
    expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
    expect(mockExecuteMigrationTransfer).not.toHaveBeenCalled()
  })

  it("rejects an expired invoice without initiating a payment", async () => {
    const result = await commitMigrationFlow({
      ...validCommitArgs(),
      sparkInvoice: expiredPaymentRequest,
    })

    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
    expect((result as Error).message).toBe("invoice is expired")
    expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
    expect(mockExecuteMigrationTransfer).not.toHaveBeenCalled()
  })

  it("rejects a Blink-internal invoice without initiating a payment", async () => {
    mockListAllPubkeys.mockReturnValue([nodePubkey])

    const result = await commitMigrationFlow(validCommitArgs())

    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
    expect((result as Error).message).toBe("invoice must not be a Blink invoice")
    expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
    expect(mockExecuteMigrationTransfer).not.toHaveBeenCalled()
  })

  it("rejects an invalid destination pubkey without initiating a payment", async () => {
    const result = await commitMigrationFlow({
      ...validCommitArgs(),
      sparkPubkey: "00".repeat(32),
    })

    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
    expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
    expect(mockExecuteMigrationTransfer).not.toHaveBeenCalled()
  })

  it("rejects a tampered proof of possession without initiating a payment", async () => {
    const args = validCommitArgs()
    const tampered =
      (args.proofSignature.slice(0, 1) === "0" ? "1" : "0") + args.proofSignature.slice(1)

    const result = await commitMigrationFlow({ ...args, proofSignature: tampered })

    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
    expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
    expect(mockExecuteMigrationTransfer).not.toHaveBeenCalled()
    expect(mockTransferIdentifierToSpark).not.toHaveBeenCalled()
  })

  it("rejects a stale proof of possession", async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 11 * 60

    const result = await commitMigrationFlow({
      ...commitArgs(),
      proofTimestamp: staleTimestamp,
      proofSignature: signProof(staleTimestamp),
    })

    expect(result).toBeInstanceOf(MigrationProofExpiredError)
    expect(mockExecuteMigrationTransfer).not.toHaveBeenCalled()
  })

  it("rejects a commit when the dollar balance is not empty", async () => {
    mockGetBalanceForWallet.mockResolvedValue(150)

    const result = await commitMigrationFlow(validCommitArgs())

    expect(result).toBeInstanceOf(MigrationDollarBalanceNotEmptyError)
    expect(mockGetBalanceForWallet).toHaveBeenCalledWith({
      walletId: accountWallets.USD.id,
    })
    expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
    expect(mockExecuteMigrationTransfer).not.toHaveBeenCalled()
  })

  it("rejects a second invoice after one is accepted without a second payment", async () => {
    mocks.findFlowByAccountId.mockResolvedValue({
      ...transferringFlow,
      lnPaymentHash: "another-payment-hash" as PaymentHash,
    })

    const result = await commitMigrationFlow(validCommitArgs())

    expect(result).toBeInstanceOf(MigrationStateConflictError)
    expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
    expect(mockExecuteMigrationTransfer).not.toHaveBeenCalled()
    expect(mockResumeMigrationFlow).not.toHaveBeenCalled()
  })

  it("rejects a commit on a completed migration", async () => {
    mocks.findFlowByAccountId.mockResolvedValue({
      ...transferringFlow,
      phase: MigrationFlowPhase.Completed,
    })

    const result = await commitMigrationFlow(validCommitArgs())

    expect(result).toBeInstanceOf(MigrationStateConflictError)
    expect(mockExecuteMigrationTransfer).not.toHaveBeenCalled()
  })

  it("resumes instead of re-sending when the same invoice is committed again mid-transfer", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(transferringFlow)
    mockResumeMigrationFlow.mockResolvedValue(transferringFlow)

    const result = await commitMigrationFlow(validCommitArgs())

    expect(result).toBe(transferringFlow)
    expect(mockResumeMigrationFlow).toHaveBeenCalledTimes(1)
    expect(mockResumeMigrationFlow).toHaveBeenCalledWith({ accountId })
    expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
    expect(mockExecuteMigrationTransfer).not.toHaveBeenCalled()
  })

  it("commits the flow funds-only: CAS to TRANSFERRING and pays once, no ln-address transfer", async () => {
    mocks.findFlowByAccountId
      .mockResolvedValueOnce(inProgressFlow)
      .mockResolvedValueOnce(transferringFlow)

    const result = await commitMigrationFlow(validCommitArgs())

    expect(result).toBe(transferringFlow)
    expect(mocks.updateFlowPhase).toHaveBeenCalledTimes(1)
    expect(mocks.updateFlowPhase).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        fromPhase: MigrationFlowPhase.InProgress,
        toPhase: MigrationFlowPhase.Transferring,
        destinationSparkPubkey: sparkPubkey,
        destinationProofVerified: true,
        lnPaymentHash: noAmountPaymentHash,
        disclosureVersion: "v1",
      }),
    )
    expect(mockTransferIdentifierToSpark).not.toHaveBeenCalled()
    expect(mockExecuteMigrationTransfer).toHaveBeenCalledTimes(1)
    expect(mockExecuteMigrationTransfer).toHaveBeenCalledWith({
      account,
      btcWalletId: accountWallets.BTC.id,
      paymentRequest: noAmountPaymentRequest,
      paymentHash: noAmountPaymentHash,
    })
  })

  it("returns the transfer error when the payment cannot be routed", async () => {
    const routeError = new RouteNotFoundError()
    mockExecuteMigrationTransfer.mockResolvedValue(routeError)

    const result = await commitMigrationFlow(validCommitArgs())

    expect(result).toBe(routeError)
    expect(mockExecuteMigrationTransfer).toHaveBeenCalledTimes(1)
  })

  it("does not move funds when the CAS to TRANSFERRING loses the race", async () => {
    const casConflict = new MigrationStateConflictError("cas raced")
    mocks.updateFlowPhase.mockResolvedValue(casConflict)

    const result = await commitMigrationFlow(validCommitArgs())

    expect(result).toBe(casConflict)
    expect(mockExecuteMigrationTransfer).not.toHaveBeenCalled()
  })
})
