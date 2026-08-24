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

const usdWalletTx = {
  id: "usd-wallet-tx",
  walletId,
  currency: "USD",
  satsFee: 250,
  centsFee: 13,
  centsAmount: 1000,
} as unknown as LedgerTransaction<WalletCurrency>

// 2022/23 backfills derived fee-exclusive centsAmount from the fee-inclusive
// legacy usd and kept both; legacy stays authoritative for those rows
const backfilledTx = {
  id: "backfilled-tx",
  walletId,
  currency: "BTC",
  fee: 30,
  usd: 10,
  feeUsd: 0.153,
  satsFee: 30,
  centsFee: 15,
  centsAmount: 985,
} as unknown as LedgerTransaction<WalletCurrency>

// 2023-03 backfill wrote NaN cents fields for 2022 onchain_on_us rows whose
// legacy feeUsd was never recorded; legacy usd is still present and correct
const nanBackfillTx = {
  id: "nan-backfill-tx",
  walletId,
  currency: "BTC",
  satsFee: 0,
  centsFee: NaN,
  centsAmount: NaN,
  usd: 4.55,
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
    expect(row.usd).toBe("5")
  })

  it("falls back to legacy fee fields for admin entries", async () => {
    const [row] = await exportCsvRows([legacyAdminTx])

    expect(row.fee).toBe("100")
    expect(row.feeUsd).toBe("0.02")
    expect(row.usd).toBe("0.5")
  })

  it("exports the fee in the row's wallet currency for usd wallets", async () => {
    const [row] = await exportCsvRows([usdWalletTx])

    expect(row.fee).toBe("13")
    expect(row.feeUsd).toBe("0.13")
    expect(row.usd).toBe("10")
  })

  it("prefers legacy dollar values on backfilled rows over cents-derived ones", async () => {
    const [row] = await exportCsvRows([backfilledTx])

    expect(row.fee).toBe("30")
    expect(row.usd).toBe("10")
    expect(row.feeUsd).toBe("0.153")
  })

  it("falls back to legacy fields on rows backfilled with NaN", async () => {
    const [row] = await exportCsvRows([nanBackfillTx])

    expect(row.fee).toBe("0")
    expect(row.feeUsd).toBe("")
    expect(row.usd).toBe("4.55")
  })
})
