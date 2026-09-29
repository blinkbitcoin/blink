import { BackfillActivitySource, resolveBackfillActivity } from "@/domain/inactivity-fee"

const iso = (value: string) => new Date(value)

const ipsFloor = iso("2023-10-09T00:00:00Z")

describe("resolveBackfillActivity", () => {
  it("keeps a newer existing value (existing 2025-06 over ledger 2024-03 and ips 2025-01)", () => {
    expect(
      resolveBackfillActivity({
        existing: iso("2025-06-01T00:00:00Z"),
        createdAt: iso("2021-01-01T00:00:00Z"),
        ledgerLast: iso("2024-03-01T00:00:00Z"),
        ipsLast: iso("2025-01-01T00:00:00Z"),
        ipsFloor,
      }),
    ).toEqual({
      value: iso("2025-06-01T00:00:00Z"),
      source: BackfillActivitySource.Existing,
    })
  })

  it("A3: no evidence and created before the accountips floor resolves to the floor", () => {
    expect(
      resolveBackfillActivity({
        existing: undefined,
        createdAt: iso("2019-05-05T00:00:00Z"),
        ledgerLast: undefined,
        ipsLast: undefined,
        ipsFloor,
      }),
    ).toEqual({ value: ipsFloor, source: BackfillActivitySource.Floor })
  })

  it("history entirely before the floor still resolves to the floor", () => {
    expect(
      resolveBackfillActivity({
        existing: undefined,
        createdAt: iso("2019-05-05T00:00:00Z"),
        ledgerLast: iso("2020-02-02T00:00:00Z"),
        ipsLast: undefined,
        ipsFloor,
      }),
    ).toEqual({ value: ipsFloor, source: BackfillActivitySource.Floor })
  })

  it("an accountips row before the floor still resolves to the floor (floor is a minimum)", () => {
    expect(
      resolveBackfillActivity({
        existing: undefined,
        createdAt: iso("2019-05-05T00:00:00Z"),
        ledgerLast: undefined,
        ipsLast: iso("2022-02-02T00:00:00Z"),
        ipsFloor,
      }),
    ).toEqual({ value: ipsFloor, source: BackfillActivitySource.Floor })
  })

  it("an accountips row exactly at the floor reports the floor, not accountips", () => {
    expect(
      resolveBackfillActivity({
        existing: undefined,
        createdAt: iso("2019-05-05T00:00:00Z"),
        ledgerLast: undefined,
        ipsLast: ipsFloor,
        ipsFloor,
      }),
    ).toEqual({ value: ipsFloor, source: BackfillActivitySource.Floor })
  })

  it("picks the ledger when the last send is the newest evidence", () => {
    expect(
      resolveBackfillActivity({
        existing: undefined,
        createdAt: iso("2022-01-01T00:00:00Z"),
        ledgerLast: iso("2025-03-03T00:00:00Z"),
        ipsLast: iso("2024-12-12T00:00:00Z"),
        ipsFloor,
      }),
    ).toEqual({
      value: iso("2025-03-03T00:00:00Z"),
      source: BackfillActivitySource.Ledger,
    })
  })

  it("picks accountips when its last connection is the newest evidence", () => {
    expect(
      resolveBackfillActivity({
        existing: undefined,
        createdAt: iso("2022-01-01T00:00:00Z"),
        ledgerLast: iso("2024-03-03T00:00:00Z"),
        ipsLast: iso("2025-01-01T00:00:00Z"),
        ipsFloor,
      }),
    ).toEqual({
      value: iso("2025-01-01T00:00:00Z"),
      source: BackfillActivitySource.AccountIps,
    })
  })

  it("treats an account created after the floor with no evidence as active at creation", () => {
    expect(
      resolveBackfillActivity({
        existing: undefined,
        createdAt: iso("2024-06-06T00:00:00Z"),
        ledgerLast: undefined,
        ipsLast: undefined,
        ipsFloor,
      }),
    ).toEqual({
      value: iso("2024-06-06T00:00:00Z"),
      source: BackfillActivitySource.Created,
    })
  })

  it("never lowers an existing value: an older evidence set loses to it", () => {
    expect(
      resolveBackfillActivity({
        existing: iso("2026-09-01T00:00:00Z"),
        createdAt: iso("2019-05-05T00:00:00Z"),
        ledgerLast: undefined,
        ipsLast: undefined,
        ipsFloor,
      }),
    ).toEqual({
      value: iso("2026-09-01T00:00:00Z"),
      source: BackfillActivitySource.Existing,
    })
  })

  it("second run: an existing value equal to the evidence reports the evidence source", () => {
    const firstRun = resolveBackfillActivity({
      existing: undefined,
      createdAt: iso("2019-05-05T00:00:00Z"),
      ledgerLast: iso("2025-03-03T00:00:00Z"),
      ipsLast: undefined,
      ipsFloor,
    })
    const secondRun = resolveBackfillActivity({
      existing: firstRun.value,
      createdAt: iso("2019-05-05T00:00:00Z"),
      ledgerLast: iso("2025-03-03T00:00:00Z"),
      ipsLast: undefined,
      ipsFloor,
    })
    expect(secondRun).toEqual(firstRun)
    expect(secondRun.source).toBe(BackfillActivitySource.Ledger)
  })

  it("second run on a floor-seeded account still reports the floor", () => {
    const secondRun = resolveBackfillActivity({
      existing: ipsFloor,
      createdAt: iso("2019-05-05T00:00:00Z"),
      ledgerLast: undefined,
      ipsLast: undefined,
      ipsFloor,
    })
    expect(secondRun).toEqual({ value: ipsFloor, source: BackfillActivitySource.Floor })
  })
})
