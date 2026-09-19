import {
  DORMANCY_MONTHS,
  calendarMonthsBefore,
  dormancyCutoffAt,
  isDormantAt,
} from "@/domain/inactivity-fee"

const iso = (value: string) => new Date(value)

describe("calendarMonthsBefore", () => {
  it("keeps the day of month and time of day when the day exists", () => {
    expect(
      calendarMonthsBefore({ date: iso("2026-05-15T10:20:30.400Z"), months: 1 }),
    ).toEqual(iso("2026-04-15T10:20:30.400Z"))
  })

  it("clamps to the last day of the target month", () => {
    expect(
      calendarMonthsBefore({ date: iso("2026-03-31T00:00:00Z"), months: 1 }),
    ).toEqual(iso("2026-02-28T00:00:00Z"))
  })

  it("clamps to Feb 29 in a leap year", () => {
    expect(
      calendarMonthsBefore({ date: iso("2024-03-31T12:00:00Z"), months: 1 }),
    ).toEqual(iso("2024-02-29T12:00:00Z"))
  })

  it("crosses the year boundary", () => {
    expect(
      calendarMonthsBefore({ date: iso("2026-01-31T00:00:00Z"), months: 2 }),
    ).toEqual(iso("2025-11-30T00:00:00Z"))
  })

  it("12 months before Feb 29 is Feb 28 of the previous year", () => {
    expect(
      calendarMonthsBefore({ date: iso("2024-02-29T00:00:00Z"), months: 12 }),
    ).toEqual(iso("2023-02-28T00:00:00Z"))
  })

  it("does not clamp when the source day is short enough", () => {
    expect(
      calendarMonthsBefore({ date: iso("2026-02-28T00:00:00Z"), months: 12 }),
    ).toEqual(iso("2025-02-28T00:00:00Z"))
  })

  it("is what the dormancy cutoff uses", () => {
    expect(DORMANCY_MONTHS).toBe(12)
    expect(dormancyCutoffAt(iso("2026-09-15T12:00:00Z"))).toEqual(
      iso("2025-09-15T12:00:00Z"),
    )
  })
})

describe("isDormantAt", () => {
  const asOf = iso("2026-09-15T12:00:00.000Z")

  it("is dormant exactly 12 calendar months after the last activity", () => {
    expect(isDormantAt({ lastActivityAt: iso("2025-09-15T12:00:00.000Z"), asOf })).toBe(
      true,
    )
  })

  it("is not dormant one millisecond inside the window", () => {
    expect(isDormantAt({ lastActivityAt: iso("2025-09-15T12:00:00.001Z"), asOf })).toBe(
      false,
    )
  })

  it("is dormant when the last activity is 13 months old", () => {
    expect(isDormantAt({ lastActivityAt: iso("2025-08-15T12:00:00Z"), asOf })).toBe(true)
  })

  it("is not dormant when the last activity is 2 months old", () => {
    expect(isDormantAt({ lastActivityAt: iso("2026-07-15T12:00:00Z"), asOf })).toBe(false)
  })
})
