jest.mock("@/services/mongoose/schema", () => ({
  MigrationFlowState: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}))

import {
  CouldNotFindMigrationFlowStateError,
  UnknownRepositoryError,
} from "@/domain/errors"
import { MigrationFlowPhase, MigrationStateConflictError } from "@/domain/migration-flow"
import { MigrationFlowStateRepository } from "@/services/mongoose/migration-flow-state"
import { MigrationFlowState } from "@/services/mongoose/schema"

const mockFindOne = MigrationFlowState.findOne as jest.Mock
const mockFindOneAndUpdate = MigrationFlowState.findOneAndUpdate as jest.Mock

const duplicateKeyError = (index: string) =>
  new Error(
    `E11000 duplicate key error collection: galoy.migrationflowstates index: ${index} dup key`,
  )

describe("MigrationFlowStateRepository", () => {
  const accountId = "account-id" as AccountId
  const paymentHash = "payment-hash" as PaymentHash
  const rawFlow = {
    accountId,
    phase: MigrationFlowPhase.InProgress,
    destinationProofVerified: false,
    steps: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const repo = MigrationFlowStateRepository()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("updatePhase", () => {
    it("returns MigrationStateConflictError when the payment hash is already bound", async () => {
      mockFindOneAndUpdate.mockRejectedValue(duplicateKeyError("lnPaymentHash_1"))

      const result = await repo.updatePhase({
        accountId,
        fromPhase: MigrationFlowPhase.InProgress,
        toPhase: MigrationFlowPhase.Transferring,
        lnPaymentHash: paymentHash,
      })

      expect(result).toBeInstanceOf(MigrationStateConflictError)
    })

    it("passes other repository errors through unchanged", async () => {
      mockFindOneAndUpdate.mockRejectedValue(new Error("some mongo failure"))

      const result = await repo.updatePhase({
        accountId,
        fromPhase: MigrationFlowPhase.InProgress,
        toPhase: MigrationFlowPhase.Transferring,
        lnPaymentHash: paymentHash,
      })

      expect(result).toBeInstanceOf(UnknownRepositoryError)
    })

    it("returns MigrationStateConflictError when no record matches the fromPhase", async () => {
      mockFindOneAndUpdate.mockResolvedValue(null)

      const result = await repo.updatePhase({
        accountId,
        fromPhase: MigrationFlowPhase.InProgress,
        toPhase: MigrationFlowPhase.Transferring,
      })

      expect(result).toBeInstanceOf(MigrationStateConflictError)
    })
  })

  describe("upsertByAccountId", () => {
    it("attaches to the existing record when two starts race on the unique accountId", async () => {
      mockFindOneAndUpdate.mockRejectedValue(duplicateKeyError("accountId_1"))
      mockFindOne.mockResolvedValue(rawFlow)

      const result = await repo.upsertByAccountId({
        accountId,
        phase: MigrationFlowPhase.InProgress,
      })

      expect(result).toMatchObject({
        accountId,
        phase: MigrationFlowPhase.InProgress,
      })
      expect(mockFindOne).toHaveBeenCalledWith({ accountId })
    })

    it("returns CouldNotFind when the racing record vanished before the re-read", async () => {
      mockFindOneAndUpdate.mockRejectedValue(duplicateKeyError("accountId_1"))
      mockFindOne.mockResolvedValue(null)

      const result = await repo.upsertByAccountId({
        accountId,
        phase: MigrationFlowPhase.InProgress,
      })

      expect(result).toBeInstanceOf(CouldNotFindMigrationFlowStateError)
    })

    it("passes other repository errors through unchanged", async () => {
      mockFindOneAndUpdate.mockRejectedValue(new Error("some mongo failure"))

      const result = await repo.upsertByAccountId({
        accountId,
        phase: MigrationFlowPhase.InProgress,
      })

      expect(result).toBeInstanceOf(UnknownRepositoryError)
    })
  })
})
