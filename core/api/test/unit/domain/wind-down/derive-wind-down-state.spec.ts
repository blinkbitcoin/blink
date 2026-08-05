import { deriveWindDownState, WindDownStatus } from "@/domain/wind-down"

const region = (overrides: Partial<WindDownRegionConfig> = {}): WindDownRegionConfig => ({
  code: "default",
  timezone: "Europe/Paris",
  receiveDisabledAt: new Date("2026-08-01T00:00:00+02:00"),
  finalDeadline: new Date("2026-08-31T23:59:59+02:00"),
  gateArmsAt: new Date("2026-09-01T00:00:00+02:00"),
  receiveDisabled: false,
  gateClosed: false,
  ...overrides,
})

const base = { enabled: true, matched: true, region: region() }

describe("deriveWindDownState", () => {
  it("returns null when the master switch is off", () => {
    expect(deriveWindDownState({ ...base, enabled: false })).toBeNull()
  })

  it("returns null when the account is not matched", () => {
    expect(deriveWindDownState({ ...base, matched: false })).toBeNull()
  })

  it("returns null when there is no region", () => {
    expect(deriveWindDownState({ ...base, region: undefined })).toBeNull()
  })

  it("returns GATED_CLOSED when the gate flag is set", () => {
    const state = deriveWindDownState({
      ...base,
      region: region({ gateClosed: true }),
    })
    expect(state?.status).toBe(WindDownStatus.GatedClosed)
  })

  it("returns RECEIVE_DISABLED when only the receiveDisabled flag is set", () => {
    const state = deriveWindDownState({
      ...base,
      region: region({ receiveDisabled: true }),
    })
    expect(state?.status).toBe(WindDownStatus.ReceiveDisabled)
  })

  it("prefers GATED_CLOSED over RECEIVE_DISABLED when both flags are set", () => {
    const state = deriveWindDownState({
      ...base,
      region: region({ gateClosed: true, receiveDisabled: true }),
    })
    expect(state?.status).toBe(WindDownStatus.GatedClosed)
  })

  it("returns PRE_CUTOFF with the region dates and timezone when both flags are off", () => {
    expect(deriveWindDownState(base)).toEqual({
      status: WindDownStatus.PreCutoff,
      receiveDisabledAt: new Date("2026-08-01T00:00:00+02:00"),
      finalDeadline: new Date("2026-08-31T23:59:59+02:00"),
      gateArmsAt: new Date("2026-09-01T00:00:00+02:00"),
      timezone: "Europe/Paris",
    })
  })

  it("passes the region's dates through untouched, never re-deriving them", () => {
    const state = deriveWindDownState({
      ...base,
      region: region({ receiveDisabledAt: new Date("2027-03-04T05:06:07+01:00") }),
    })
    expect(state?.receiveDisabledAt).toEqual(new Date("2027-03-04T05:06:07+01:00"))
  })
})
