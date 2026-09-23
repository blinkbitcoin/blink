jest.mock("@/config", () => ({ MS_PER_DAY: 86_400_000 }))

jest.mock("@/services/ledger/books", () => ({ Transaction: {} }))

jest.mock("@/services/tracing", () => ({ addAttributesToCurrentSpan: jest.fn() }))

import {
  InactivityFeeLedgerTransactionType,
  LedgerTransactionType,
} from "@/domain/ledger"
import { TxnGroups } from "@/services/ledger/facade/volume"

describe("TxnGroups", () => {
  const feeTypes: string[] = Object.values(InactivityFeeLedgerTransactionType)

  it.each(Object.keys(TxnGroups))("%s holds no inactivity fee type", (group) => {
    const types: readonly string[] = TxnGroups[group as TxnGroup]

    expect(types.filter((type) => feeTypes.includes(type))).toEqual([])
  })

  it("allTxBaseVolumeSince is every other ledger type", () => {
    expect([...TxnGroups.allTxBaseVolumeSince].sort()).toEqual(
      Object.values(LedgerTransactionType)
        .filter((type) => !feeTypes.includes(type))
        .sort(),
    )
  })
})
