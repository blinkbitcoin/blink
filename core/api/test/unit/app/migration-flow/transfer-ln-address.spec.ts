jest.mock("@/app/accounts/lnurl-server", () => ({
  getLnurlServerService: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: {
    addFlowStep: jest.fn(),
  },
  MigrationFlowStateRepository: () => ({
    addStep: jest.requireMock("@/services/mongoose").__mocks.addFlowStep,
  }),
}))

jest.mock("@/services/tracing", () => ({
  recordExceptionInCurrentSpan: jest.fn(),
}))

import { getLnurlServerService } from "@/app/accounts/lnurl-server"
import { transferLnAddressToSpark } from "@/app/migration-flow/transfer-ln-address"
import { AccountStatus } from "@/domain/accounts"

const mocks = jest.requireMock("@/services/mongoose").__mocks as {
  addFlowStep: jest.Mock
}
const mockGetLnurlServerService = getLnurlServerService as jest.Mock

describe("transferLnAddressToSpark", () => {
  const accountId = "account-id" as AccountId
  const destinationSparkPubkey = "ab".repeat(32) as SparkPubkey
  const account = {
    id: accountId,
    status: AccountStatus.Active,
    username: "alice" as Username,
  } as Account

  const mockTransferIdentifierToSpark = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mocks.addFlowStep.mockResolvedValue({} as MigrationFlow)
    mockGetLnurlServerService.mockReturnValue({
      transferIdentifierToSpark: mockTransferIdentifierToSpark,
    })
    mockTransferIdentifierToSpark.mockResolvedValue({
      lightningAddress: "alice@spark.example",
    })
  })

  it("skips accounts without a username", async () => {
    await expect(
      transferLnAddressToSpark({
        account: { ...account, username: undefined },
        destinationSparkPubkey,
      }),
    ).resolves.toBeUndefined()

    expect(mockTransferIdentifierToSpark).not.toHaveBeenCalled()
  })

  it("skips when the lnurl server is not configured", async () => {
    mockGetLnurlServerService.mockReturnValue(null)

    await expect(
      transferLnAddressToSpark({ account, destinationSparkPubkey }),
    ).resolves.toBeUndefined()

    expect(mockTransferIdentifierToSpark).not.toHaveBeenCalled()
  })

  it("re-points the ln-address to the bound spark pubkey", async () => {
    await transferLnAddressToSpark({ account, destinationSparkPubkey })

    expect(mockTransferIdentifierToSpark).toHaveBeenCalledTimes(1)
    expect(mockTransferIdentifierToSpark).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: account.username,
        destinationSparkPubkey,
      }),
    )
    expect(mocks.addFlowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        step: expect.objectContaining({ step: "ln-address-transfer" }),
      }),
    )
  })

  it("does not abort when the transfer fails, it records the failure and resolves", async () => {
    mockTransferIdentifierToSpark.mockResolvedValue(new Error("lnurl server error"))

    await expect(
      transferLnAddressToSpark({ account, destinationSparkPubkey }),
    ).resolves.toBeUndefined()

    expect(mocks.addFlowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        step: expect.objectContaining({
          step: "ln-address-transfer",
          detail: expect.stringContaining("failed"),
        }),
      }),
    )
  })

  it("does not propagate a thrown transfer error, it records the failure and resolves", async () => {
    mockTransferIdentifierToSpark.mockRejectedValue(new Error("lnurl server down"))

    await expect(
      transferLnAddressToSpark({ account, destinationSparkPubkey }),
    ).resolves.toBeUndefined()

    expect(mocks.addFlowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        step: expect.objectContaining({
          step: "ln-address-transfer",
          detail: expect.stringContaining("failed"),
        }),
      }),
    )
  })
})
