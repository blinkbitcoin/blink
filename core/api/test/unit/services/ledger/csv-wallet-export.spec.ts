import { CsvWalletsExport } from "@/services/ledger/csv-wallet-export"

jest.mock("@/services/ledger", () => ({
  __mockGetTransactionsByWalletId: jest.fn(),
  LedgerService: () => ({
    getTransactionsByWalletId:
      jest.requireMock("@/services/ledger").__mockGetTransactionsByWalletId,
  }),
}))

jest.mock("@/services/logger", () => ({
  baseLogger: {},
}))

const mockGetTransactionsByWalletId =
  jest.requireMock("@/services/ledger").__mockGetTransactionsByWalletId

const walletId = "walletId" as WalletId

const userTx = {
  id: "user-tx",
  walletId,
  satsFee: 250,
  centsFee: 13,
  centsAmount: 1000,
} as unknown as LedgerTransaction<WalletCurrency>

const zeroFeeTx = {
  id: "zero-fee-tx",
  walletId,
  satsFee: 0,
  centsFee: 0,
  centsAmount: 500,
} as unknown as LedgerTransaction<WalletCurrency>

const legacyAdminTx = {
  id: "legacy-admin-tx",
  walletId,
  fee: 100,
  usd: 0.5,
  feeUsd: 0.02,
} as unknown as LedgerTransaction<WalletCurrency>

const exportCsvRows = async (
  txs: LedgerTransaction<WalletCurrency>[],
): Promise<Record<string, string>[]> => {
  mockGetTransactionsByWalletId.mockResolvedValue(txs)

  const csv = new CsvWalletsExport()
  await csv.addWallet(walletId)

  const [headerLine, ...rowLines] = Buffer.from(csv.getBase64(), "base64")
    .toString("utf8")
    .split("\n")
    .filter((line) => line.length > 0)
  const headers = headerLine.split(",")

  return rowLines.map((line) => {
    const cells = line.split(",")
    return Object.fromEntries(headers.map((header, i) => [header, cells[i]]))
  })
}

describe("CsvWalletsExport", () => {
  it("populates fee columns from satsFee/centsFee for user transactions", async () => {
    const [row] = await exportCsvRows([userTx])

    expect(row.fee).toBe("250")
    expect(row.feeUsd).toBe("0.13")
    expect(row.usd).toBe("10")
  })

  it("writes 0 (not empty) for zero-fee transactions", async () => {
    const [row] = await exportCsvRows([zeroFeeTx])

    expect(row.fee).toBe("0")
    expect(row.feeUsd).toBe("0")
  })

  it("falls back to legacy fee fields for admin entries", async () => {
    const [row] = await exportCsvRows([legacyAdminTx])

    expect(row.fee).toBe("100")
    expect(row.feeUsd).toBe("0.02")
    expect(row.usd).toBe("0.5")
  })
})
