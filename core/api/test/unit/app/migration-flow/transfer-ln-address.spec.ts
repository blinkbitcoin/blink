jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  getCustodialMigrationFlowConfig: jest.fn(),
}))

jest.mock("@/app/accounts/lnurl-server", () => ({
  getLnurlServerService: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: {
    findUserById: jest.fn(),
    findFlowByAccountId: jest.fn(),
    addFlowStep: jest.fn(),
  },
  UsersRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findUserById,
  }),
  MigrationFlowStateRepository: () => ({
    findByAccountId: jest.requireMock("@/services/mongoose").__mocks.findFlowByAccountId,
    addStep: jest.requireMock("@/services/mongoose").__mocks.addFlowStep,
  }),
}))

jest.mock("@/services/tracing", () => ({
  recordExceptionInCurrentSpan: jest.fn(),
}))

import { createHash } from "crypto"

import * as ecc from "tiny-secp256k1"

import { getLnurlServerService } from "@/app/accounts/lnurl-server"
import { transferLnAddressesToSpark } from "@/app/migration-flow/transfer-ln-address"
import { getCustodialMigrationFlowConfig } from "@/config"
import { AccountStatus } from "@/domain/accounts"
import {
  CouldNotFindMigrationFlowStateError,
  InactiveAccountError,
} from "@/domain/errors"
import {
  LnurlServerConflictError,
  LnurlServerNotFoundError,
  LnurlServerUnavailableError,
} from "@/domain/lnurl-server"
import {
  buildMigrationProofChallenge,
  MigrationApiKeyForbiddenError,
  MigrationFlowDisabledError,
  MigrationInvalidDestinationError,
  MigrationLnAddressTransferStatus,
} from "@/domain/migration-flow"

const mocks = jest.requireMock("@/services/mongoose").__mocks as {
  findUserById: jest.Mock
  findFlowByAccountId: jest.Mock
  addFlowStep: jest.Mock
}
const mockGetLnurlServerService = getLnurlServerService as jest.Mock

const privateKey = Buffer.alloc(32, 7)
const sparkPubkey = Buffer.from(ecc.xOnlyPointFromScalar(privateKey)).toString("hex")

const accountId = "account-id" as AccountId
const username = "alice" as Username
const phone = "+15555550123" as PhoneNumber

const account = {
  id: accountId,
  status: AccountStatus.Active,
  username,
  kratosUserId: "user-id" as UserId,
} as Account

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
  return Buffer.from(ecc.signSchnorr(digest, privateKey)).toString("hex")
}

const validProof = () => {
  const proofTimestamp = Math.floor(Date.now() / 1000)
  return { proofTimestamp, proofSignature: signProof(proofTimestamp) }
}

const args = () => ({ account, sparkPubkey, ...validProof() })

const mockTransferIdentifierToSpark = jest.fn()
const mockGetIdentifier = jest.fn()

const lightningAddressFor = (identifier: string) => `${identifier}@spark.example`

describe("transferLnAddressesToSpark", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getCustodialMigrationFlowConfig as jest.Mock).mockReturnValue({
      enabled: true,
      deMinimisThresholdSats: 100,
    })
    mocks.findUserById.mockResolvedValue({ id: account.kratosUserId, phone } as User)
    mocks.findFlowByAccountId.mockResolvedValue({
      accountId,
      steps: [],
    } as unknown as MigrationFlow)
    mocks.addFlowStep.mockResolvedValue({} as MigrationFlow)
    mockGetLnurlServerService.mockReturnValue({
      transferIdentifierToSpark: mockTransferIdentifierToSpark,
      getIdentifier: mockGetIdentifier,
    })
    mockTransferIdentifierToSpark.mockImplementation(async ({ identifier }) => ({
      lightningAddress: lightningAddressFor(identifier),
    }))
  })

  it("refuses an API-key caller before any lnurl-server call", async () => {
    const result = await transferLnAddressesToSpark({
      ...args(),
      apiKeyId: "api-key-id" as ApiKeyId,
    })

    expect(result).toBeInstanceOf(MigrationApiKeyForbiddenError)
    expect(mockGetLnurlServerService).not.toHaveBeenCalled()
    expect(mockTransferIdentifierToSpark).not.toHaveBeenCalled()
    expect(mocks.addFlowStep).not.toHaveBeenCalled()
  })

  it("refuses when the migration feature flag is off, before any lnurl-server call", async () => {
    ;(getCustodialMigrationFlowConfig as jest.Mock).mockReturnValue({
      enabled: false,
      deMinimisThresholdSats: 100,
    })

    const result = await transferLnAddressesToSpark(args())

    expect(result).toBeInstanceOf(MigrationFlowDisabledError)
    expect(mockGetLnurlServerService).not.toHaveBeenCalled()
    expect(mockTransferIdentifierToSpark).not.toHaveBeenCalled()
  })

  it("treats a conflict at the same pubkey as idempotent regardless of hex casing", async () => {
    mocks.findUserById.mockResolvedValue({ id: account.kratosUserId } as User)
    mockTransferIdentifierToSpark.mockResolvedValue(new LnurlServerConflictError())
    mockGetIdentifier.mockResolvedValue({
      provider: "spark",
      providerDetails: { sparkPubkey: sparkPubkey.toUpperCase() },
    })

    const results = await transferLnAddressesToSpark(args())

    expect(results).toEqual([
      {
        identifier: username,
        status: MigrationLnAddressTransferStatus.AlreadyTransferred,
      },
    ])
  })

  it("transfers username + phone and records a step per identifier", async () => {
    const results = await transferLnAddressesToSpark(args())

    expect(results).toEqual([
      {
        identifier: username,
        status: MigrationLnAddressTransferStatus.Transferred,
        lightningAddress: lightningAddressFor(username),
      },
      {
        identifier: phone,
        status: MigrationLnAddressTransferStatus.Transferred,
        lightningAddress: lightningAddressFor(phone),
      },
    ])
    expect(mockTransferIdentifierToSpark).toHaveBeenCalledTimes(2)
    expect(mocks.addFlowStep).toHaveBeenCalledTimes(2)
    expect(mocks.addFlowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        step: expect.objectContaining({ step: "ln-address-transfer" }),
      }),
    )
  })

  it("returns per-identifier partial failure, then re-attempts only the failed one on retry", async () => {
    mockTransferIdentifierToSpark.mockImplementation(async ({ identifier }) => {
      if (identifier === phone) return new LnurlServerUnavailableError("5xx")
      return { lightningAddress: lightningAddressFor(identifier) }
    })

    const first = await transferLnAddressesToSpark(args())

    expect(first).toEqual([
      expect.objectContaining({
        identifier: username,
        status: MigrationLnAddressTransferStatus.Transferred,
      }),
      { identifier: phone, status: MigrationLnAddressTransferStatus.Failed },
    ])

    mockTransferIdentifierToSpark.mockImplementation(async ({ identifier }) => {
      if (identifier === username) return new LnurlServerConflictError("conflict")
      return { lightningAddress: lightningAddressFor(identifier) }
    })
    mockGetIdentifier.mockResolvedValue({
      provider: "spark",
      providerDetails: { sparkPubkey },
    } as LnurlServerIdentifier)

    const retry = await transferLnAddressesToSpark(args())

    expect(retry).toEqual([
      {
        identifier: username,
        status: MigrationLnAddressTransferStatus.AlreadyTransferred,
      },
      expect.objectContaining({
        identifier: phone,
        status: MigrationLnAddressTransferStatus.Transferred,
      }),
    ])
    expect(mockGetIdentifier).toHaveBeenCalledTimes(1)
    expect(mockGetIdentifier).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: username }),
    )
  })

  it("proceeds standalone without a migration record and records no steps", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(
      new CouldNotFindMigrationFlowStateError(accountId),
    )

    const results = await transferLnAddressesToSpark(args())

    expect(results).toEqual([
      expect.objectContaining({ status: MigrationLnAddressTransferStatus.Transferred }),
      expect.objectContaining({ status: MigrationLnAddressTransferStatus.Transferred }),
    ])
    expect(mockTransferIdentifierToSpark).toHaveBeenCalledTimes(2)
    expect(mocks.addFlowStep).not.toHaveBeenCalled()
  })

  it("allows a migrated account (post-completion self-heal)", async () => {
    const results = await transferLnAddressesToSpark({
      ...args(),
      account: { ...account, status: AccountStatus.Migrated } as Account,
    })

    expect(results).not.toBeInstanceOf(Error)
    expect(mockTransferIdentifierToSpark).toHaveBeenCalledTimes(2)
  })

  it("skips an unregistered identifier and continues with the others", async () => {
    mockTransferIdentifierToSpark.mockImplementation(async ({ identifier }) => {
      if (identifier === username) return new LnurlServerNotFoundError("404")
      return { lightningAddress: lightningAddressFor(identifier) }
    })

    const results = await transferLnAddressesToSpark(args())

    expect(results).toEqual([
      {
        identifier: username,
        status: MigrationLnAddressTransferStatus.SkippedNotRegistered,
      },
      expect.objectContaining({
        identifier: phone,
        status: MigrationLnAddressTransferStatus.Transferred,
      }),
    ])
  })

  it("fails only the identifier already pointing at a different pubkey", async () => {
    mockTransferIdentifierToSpark.mockImplementation(async ({ identifier }) => {
      if (identifier === username) return new LnurlServerConflictError("conflict")
      return { lightningAddress: lightningAddressFor(identifier) }
    })
    mockGetIdentifier.mockResolvedValue({
      provider: "spark",
      providerDetails: { sparkPubkey: "cd".repeat(32) },
    } as LnurlServerIdentifier)

    const results = await transferLnAddressesToSpark(args())

    expect(results).toEqual([
      { identifier: username, status: MigrationLnAddressTransferStatus.Failed },
      expect.objectContaining({
        identifier: phone,
        status: MigrationLnAddressTransferStatus.Transferred,
      }),
    ])
  })

  it("treats a conflict already at the same pubkey as an idempotent no-op", async () => {
    mocks.findUserById.mockResolvedValue({ id: account.kratosUserId } as User)
    mockTransferIdentifierToSpark.mockResolvedValue(
      new LnurlServerConflictError("conflict"),
    )
    mockGetIdentifier.mockResolvedValue({
      provider: "spark",
      providerDetails: { sparkPubkey },
    } as LnurlServerIdentifier)

    const results = await transferLnAddressesToSpark(args())

    expect(results).toEqual([
      {
        identifier: username,
        status: MigrationLnAddressTransferStatus.AlreadyTransferred,
      },
    ])
  })

  it("rejects a tampered proof before any lnurl-server call", async () => {
    const valid = args()
    const tampered =
      (valid.proofSignature[0] === "0" ? "1" : "0") + valid.proofSignature.slice(1)

    const result = await transferLnAddressesToSpark({
      ...valid,
      proofSignature: tampered,
    })

    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
    expect(mockGetLnurlServerService).not.toHaveBeenCalled()
    expect(mockTransferIdentifierToSpark).not.toHaveBeenCalled()
  })

  it("rejects a stale proof before any lnurl-server call", async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 11 * 60

    const result = await transferLnAddressesToSpark({
      account,
      sparkPubkey,
      proofTimestamp: staleTimestamp,
      proofSignature: signProof(staleTimestamp),
    })

    expect(result).toBeInstanceOf(Error)
    expect(mockGetLnurlServerService).not.toHaveBeenCalled()
    expect(mockTransferIdentifierToSpark).not.toHaveBeenCalled()
  })

  it("returns an empty success result when there are no identifiers", async () => {
    mocks.findUserById.mockResolvedValue({ id: account.kratosUserId } as User)

    const results = await transferLnAddressesToSpark({
      ...args(),
      account: { ...account, username: undefined } as Account,
    })

    expect(results).toEqual([])
    expect(mockTransferIdentifierToSpark).not.toHaveBeenCalled()
  })

  it("rejects a disallowed account status before any lookup", async () => {
    const result = await transferLnAddressesToSpark({
      ...args(),
      account: { ...account, status: AccountStatus.Locked } as Account,
    })

    expect(result).toBeInstanceOf(InactiveAccountError)
    expect(mocks.findUserById).not.toHaveBeenCalled()
    expect(mockTransferIdentifierToSpark).not.toHaveBeenCalled()
  })
})
