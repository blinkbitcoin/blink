jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  accessSync: jest.fn(),
}))
jest.mock("@/app/migration-flow/post-migration-deposit-release", () => ({
  inspectPostMigrationDepositRelease: jest.fn(),
  preparePostMigrationDepositRelease: jest.fn(),
  releasePostMigrationDeposit: jest.fn(),
  reconcilePostMigrationDepositRelease: jest.fn(),
}))
jest.mock("@/services/mongodb", () => ({ setupMongoConnection: jest.fn() }))

import { accessSync } from "fs"

import {
  inspectPostMigrationDepositRelease,
  preparePostMigrationDepositRelease,
  reconcilePostMigrationDepositRelease,
  releasePostMigrationDeposit,
} from "@/app/migration-flow/post-migration-deposit-release"
import {
  inspect,
  main,
  parseOutput,
  prepare,
  reconcile,
  release,
  steps,
} from "@/debug/post-migration-deposit-release"
import { MigrationStateConflictError } from "@/domain/migration-flow"

const mockInspect = inspectPostMigrationDepositRelease as jest.Mock
const mockPrepare = preparePostMigrationDepositRelease as jest.Mock
const mockRelease = releasePostMigrationDeposit as jest.Mock
const mockReconcile = reconcilePostMigrationDepositRelease as jest.Mock
const mockAccessSync = accessSync as jest.Mock

describe("post-migration deposit release CLI", () => {
  const txid = "ab".repeat(32)
  const inspectionArgs = [
    "11111111-1111-4111-8111-111111111111",
    txid,
    "2",
    "bcrt1qaddress",
    "alice@wallet.example",
  ]
  const originalArgv = process.argv

  beforeEach(() => {
    jest.clearAllMocks()
    mockAccessSync.mockReturnValue(undefined)
    process.exitCode = undefined
  })

  afterAll(() => {
    process.argv = originalArgv
    process.exitCode = undefined
  })

  it("exposes only the four recovery steps", () => {
    expect(steps).toEqual(["inspect", "prepare", "release", "reconcile"])
  })

  it("parses and normalizes an exact output", () => {
    expect(parseOutput(txid.toUpperCase(), "7")).toEqual({
      txHash: txid,
      vout: 7,
    })
  })

  it.each([
    [undefined, "0"],
    ["not-a-txid", "0"],
    [txid, undefined],
    [txid, "-1"],
    [txid, "1.5"],
  ])("rejects invalid output %s:%s", (hash, vout) => {
    expect(parseOutput(hash, vout)).toBeInstanceOf(Error)
  })

  it("rejects a vout outside the safe integer range", () => {
    expect(parseOutput(txid, `${Number.MAX_SAFE_INTEGER + 1}`)).toBeInstanceOf(Error)
  })

  it("validates inspection arguments before calling the app", async () => {
    expect(await inspect([])).toBeInstanceOf(Error)
    expect(mockInspect).not.toHaveBeenCalled()
  })

  it("propagates inspection failure", async () => {
    const error = new MigrationStateConflictError("inspect")
    mockInspect.mockResolvedValue(error)

    expect(await inspect(inspectionArgs)).toBe(error)
  })

  it("prints a successful inspection plan", async () => {
    const log = jest.spyOn(console, "log").mockImplementation()
    mockInspect.mockResolvedValue({
      account: { id: inspectionArgs[0], status: "migrated" },
      btcWallet: { id: "wallet-id" },
      walletBalanceSats: 2_000,
      txHash: txid,
      vout: 2,
      address: inspectionArgs[3],
      receiptJournalId: "journal-id",
      receiptAmountSats: 1_000,
      payoutAmountSats: 1_000,
      lightningAddress: inspectionArgs[4],
    })

    expect(await inspect(inspectionArgs)).toBe(true)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"payoutAmountSats": 1000'))
    log.mockRestore()
  })

  it("validates prepare arguments and propagates app failure", async () => {
    expect(await prepare([])).toBeInstanceOf(Error)
    const error = new MigrationStateConflictError("prepare")
    mockPrepare.mockResolvedValue(error)

    expect(await prepare([...inspectionArgs, "CASE", "123"])).toBe(error)
    expect(mockPrepare).toHaveBeenCalledWith(
      expect.objectContaining({ caseReference: "CASE 123" }),
    )
  })

  it("prints a prepared release", async () => {
    const log = jest.spyOn(console, "log").mockImplementation()
    mockPrepare.mockResolvedValue({ status: "PREPARED" })

    expect(await prepare([...inspectionArgs, "CASE-123"])).toBe(true)
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })

  it.each([
    ["release", release, mockRelease],
    ["reconcile", reconcile, mockReconcile],
  ] as const)("validates and propagates %s failure", async (_name, runner, mockApp) => {
    expect(await runner([])).toBeInstanceOf(Error)
    const error = new MigrationStateConflictError("app")
    mockApp.mockResolvedValue(error)

    expect(await runner([txid, "2"])).toBe(error)
  })

  it.each([
    ["release", release, mockRelease],
    ["reconcile", reconcile, mockReconcile],
  ] as const)("prints successful %s output", async (_name, runner, mockApp) => {
    const log = jest.spyOn(console, "log").mockImplementation()
    mockApp.mockResolvedValue({ status: "COMPLETED" })

    expect(await runner([txid, "2"])).toBe(true)
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })

  it("sets failure status when the config path is absent", async () => {
    const error = jest.spyOn(console, "error").mockImplementation()
    process.argv = ["node", "script"]

    await main()

    expect(process.exitCode).toBe(1)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it("hard-fails before running any step when the config path is unreadable", async () => {
    const error = jest.spyOn(console, "error").mockImplementation()
    mockAccessSync.mockImplementation(() => {
      throw new Error("ENOENT")
    })
    process.argv = ["node", "script", "/missing/custom.yaml", "release", txid, "2"]

    await main()

    expect(process.exitCode).toBe(1)
    expect(error).toHaveBeenCalledWith(expect.stringContaining("/missing/custom.yaml"))
    expect(mockRelease).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it("sets failure status for an unknown step", async () => {
    const error = jest.spyOn(console, "error").mockImplementation()
    process.argv = ["node", "script", "/custom.yaml", "unknown"]

    await main()

    expect(process.exitCode).toBe(1)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it("runs a selected step", async () => {
    const log = jest.spyOn(console, "log").mockImplementation()
    mockRelease.mockResolvedValue({ status: "COMPLETED" })
    process.argv = ["node", "script", "/custom.yaml", "release", txid, "2"]

    await main()

    expect(process.exitCode).toBeUndefined()
    expect(mockRelease).toHaveBeenCalled()
    log.mockRestore()
  })

  it("sets failure status when the selected step fails", async () => {
    const error = jest.spyOn(console, "error").mockImplementation()
    mockRelease.mockResolvedValue(new MigrationStateConflictError("release"))
    process.argv = ["node", "script", "/custom.yaml", "release", txid, "2"]

    await main()

    expect(process.exitCode).toBe(1)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
