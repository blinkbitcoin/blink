import mongoose from "mongoose"

import {
  createStreamSettledTransactions,
  settledTransactionChangeStreamPipeline,
  settledTransactionFilter,
} from "@/services/ledger/stream-settled-transactions"

import { LedgerTransactionType } from "@/domain/ledger"
import { UnknownLedgerError } from "@/domain/ledger/errors"
import { WalletCurrency } from "@/domain/shared"

const createRawTransaction = (
  id: string,
  overrides: Partial<ILedgerTransaction> = {},
): ILedgerTransaction =>
  ({
    _id: new mongoose.Types.ObjectId(id),
    credit: 100,
    debit: 0,
    datetime: new Date("2024-01-01T00:00:05Z"),
    account_path: ["Liabilities"],
    accounts: "Liabilities:wallet-1",
    book: "MainBook",
    memo: "",
    _journal: new mongoose.Types.ObjectId("661111111111111111111199"),
    timestamp: new Date("2024-01-01T00:00:00Z"),
    hash: "payment-hash",
    type: LedgerTransactionType.Invoice,
    pending: false,
    currency: WalletCurrency.Btc,
    feeKnownInAdvance: false,
    ...overrides,
  }) as ILedgerTransaction

const createCursor = (values: ILedgerTransaction[]) => {
  const cursor = {
    async *[Symbol.asyncIterator]() {
      for (const value of values) yield value
    },
    close: jest.fn().mockResolvedValue(undefined),
  }

  return cursor
}

const createTransactionModel = ({
  replay = [],
  changes = [],
  changeError,
}: {
  replay?: ILedgerTransaction[]
  changes?: ILedgerTransaction[]
  changeError?: Error
} = {}) => {
  const cursor = createCursor(replay)
  const cursorFn = jest.fn().mockReturnValue(cursor)
  const sort = jest.fn().mockReturnValue({ cursor: cursorFn })
  const find = jest.fn().mockReturnValue({ sort })

  const next = jest.fn()
  for (const change of changes) {
    next.mockResolvedValueOnce({ fullDocument: change })
  }
  if (changeError) {
    next.mockRejectedValueOnce(changeError)
  } else {
    next.mockImplementation(
      () =>
        new Promise(() => {
          // Intentionally left pending until the stream is closed.
        }),
    )
  }

  const changeStream = {
    next,
    close: jest.fn().mockResolvedValue(undefined),
  }
  const watch = jest.fn().mockReturnValue(changeStream)

  return {
    transactionModel: { find, watch },
    changeStream,
    cursor,
    cursorFn,
    find,
    sort,
    watch,
  }
}

describe("settled transaction stream query helpers", () => {
  it("filters settled customer transactions after a cursor", () => {
    const filter = settledTransactionFilter(
      "661111111111111111111111" as LedgerTransactionId,
    )

    expect(filter).toMatchObject({
      accounts: /^Liabilities:/,
      pending: false,
      voided: { $ne: true },
      type: {
        $nin: [
          LedgerTransactionType.Fee,
          LedgerTransactionType.ToColdStorage,
          LedgerTransactionType.ToHotWallet,
          LedgerTransactionType.Escrow,
          LedgerTransactionType.RoutingRevenue,
          LedgerTransactionType.Reconciliation,
        ],
      },
    })
    expect((filter._id as { $gt: mongoose.Types.ObjectId }).$gt.toString()).toBe(
      "661111111111111111111111",
    )
  })

  it("builds the same constraints for live change streams", () => {
    const pipeline = settledTransactionChangeStreamPipeline(
      "661111111111111111111111" as LedgerTransactionId,
    )

    expect(pipeline).toEqual([
      {
        $match: {
          "operationType": { $in: ["insert", "replace", "update"] },
          "$or": [
            { operationType: { $in: ["insert", "replace"] } },
            { "updateDescription.updatedFields.pending": false },
          ],
          "fullDocument.accounts": /^Liabilities:/,
          "fullDocument.pending": false,
          "fullDocument.voided": { $ne: true },
          "fullDocument.type": {
            $nin: [
              LedgerTransactionType.Fee,
              LedgerTransactionType.ToColdStorage,
              LedgerTransactionType.ToHotWallet,
              LedgerTransactionType.Escrow,
              LedgerTransactionType.RoutingRevenue,
              LedgerTransactionType.Reconciliation,
            ],
          },
          "fullDocument._id": {
            $gt: new mongoose.Types.ObjectId("661111111111111111111111"),
          },
        },
      },
    ])
  })
})

describe("createStreamSettledTransactions", () => {
  it("opens the change stream before replay and skips replay overlap", async () => {
    const replayTxn = createRawTransaction("661111111111111111111112")
    const liveTxn = createRawTransaction("661111111111111111111113")
    const model = createTransactionModel({
      replay: [replayTxn],
      changes: [replayTxn, liveTxn],
    })
    const streamSettledTransactions = createStreamSettledTransactions({
      transactionModel: model.transactionModel,
    })

    const stream = streamSettledTransactions({
      afterTransactionId: "661111111111111111111111" as LedgerTransactionId,
    })

    await expect(stream.next()).resolves.toMatchObject({
      value: { id: "661111111111111111111112" },
      done: false,
    })
    await expect(stream.next()).resolves.toMatchObject({
      value: { id: "661111111111111111111113" },
      done: false,
    })
    await stream.return(undefined)

    expect(model.watch.mock.invocationCallOrder[0]).toBeLessThan(
      model.find.mock.invocationCallOrder[0],
    )
    expect(model.find).toHaveBeenCalledTimes(1)
    expect(model.sort).toHaveBeenCalledWith({ _id: 1 })
    expect(model.cursorFn).toHaveBeenCalledWith({ batchSize: 100 })
    expect(model.cursor.close).toHaveBeenCalled()
    expect(model.changeStream.close).toHaveBeenCalled()
  })

  it("bounds replay overlap dedupe while still skipping recent overlap", async () => {
    const replayedThenEvictedTxn = createRawTransaction("661111111111111111111112")
    const replayedRecentTxn = createRawTransaction("661111111111111111111113")
    const liveTxn = createRawTransaction("661111111111111111111114")
    const model = createTransactionModel({
      replay: [replayedThenEvictedTxn, replayedRecentTxn],
      changes: [replayedRecentTxn, liveTxn],
    })
    const streamSettledTransactions = createStreamSettledTransactions({
      transactionModel: model.transactionModel,
      maxReplayDedupeCacheSize: 1,
    })

    const stream = streamSettledTransactions({
      afterTransactionId: "661111111111111111111111" as LedgerTransactionId,
    })

    await expect(stream.next()).resolves.toMatchObject({
      value: { id: "661111111111111111111112" },
      done: false,
    })
    await expect(stream.next()).resolves.toMatchObject({
      value: { id: "661111111111111111111113" },
      done: false,
    })
    await expect(stream.next()).resolves.toMatchObject({
      value: { id: "661111111111111111111114" },
      done: false,
    })
    await stream.return(undefined)
  })

  it("starts live-only when no cursor is provided", async () => {
    const liveTxn = createRawTransaction("661111111111111111111113")
    const model = createTransactionModel({ changes: [liveTxn] })
    const streamSettledTransactions = createStreamSettledTransactions({
      transactionModel: model.transactionModel,
    })

    const stream = streamSettledTransactions()

    await expect(stream.next()).resolves.toMatchObject({
      value: { id: "661111111111111111111113" },
      done: false,
    })
    await stream.return(undefined)

    expect(model.find).not.toHaveBeenCalled()
    expect(model.watch).toHaveBeenCalledWith(
      [
        {
          $match: expect.not.objectContaining({
            "fullDocument._id": expect.anything(),
          }),
        },
      ],
      { fullDocument: "updateLookup" },
    )
  })

  it("surfaces change stream errors as ledger errors", async () => {
    const model = createTransactionModel({
      changeError: new Error("change stream failed"),
    })
    const streamSettledTransactions = createStreamSettledTransactions({
      transactionModel: model.transactionModel,
    })

    const stream = streamSettledTransactions()
    const result = await stream.next()

    expect(result.value).toBeInstanceOf(UnknownLedgerError)
    await stream.return(undefined)
    expect(model.changeStream.close).toHaveBeenCalled()
  })
})
