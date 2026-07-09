import { deriveWindDownState, WindDownStatus } from "@/domain/wind-down"

const region = (overrides: Partial<WindDownRegionConfig> = {}): WindDownRegionConfig => ({
  code: "default",
  timezone: "Europe/Paris",
  receiveDisabledAt: "2026-08-01T00:00:00+02:00",
  finalDeadline: "2026-08-31T23:59:59+02:00",
  gateArmsAt: "2026-09-01T00:00:00+02:00",
  receiveDisable: { enabled: false },
  gate: { enabled: false },
  ...overrides,
})

const base = { enabled: true, exempt: false, matched: true, region: region() }

describe("deriveWindDownState", () => {
  it("returns null when the master switch is off", () => {
    expect(deriveWindDownState({ ...base, enabled: false })).toBeNull()
  })

  it("returns null when the account is exempt", () => {
    expect(deriveWindDownState({ ...base, exempt: true })).toBeNull()
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
      region: region({ gate: { enabled: true } }),
    })
    expect(state?.status).toBe(WindDownStatus.GatedClosed)
  })

  it("returns RECEIVE_DISABLED when only the receiveDisable flag is set", () => {
    const state = deriveWindDownState({
      ...base,
      region: region({
        receiveDisable: {
          enabled: true,
        },
      }),
    })
    expect(state?.status).toBe(WindDownStatus.ReceiveDisabled)
  })

  it("prefers GATED_CLOSED over RECEIVE_DISABLED when both flags are set", () => {
    const state = deriveWindDownState({
      ...base,
      region: region({
        gate: { enabled: true },
        receiveDisable: {
          enabled: true,
        },
      }),
    })
    expect(state?.status).toBe(WindDownStatus.GatedClosed)
  })

  it("returns PRE_CUTOFF with the region dates and timezone when both flags are off", () => {
    expect(deriveWindDownState(base)).toEqual({
      status: WindDownStatus.PreCutoff,
      receiveDisabledAt: "2026-08-01T00:00:00+02:00",
      finalDeadline: "2026-08-31T23:59:59+02:00",
      gateArmsAt: "2026-09-01T00:00:00+02:00",
      timezone: "Europe/Paris",
    })
  })

  it("passes a null receiveDisabledAt through unchanged", () => {
    const state = deriveWindDownState({
      ...base,
      region: region({ receiveDisabledAt: null }),
    })
    expect(state?.receiveDisabledAt).toBeNull()
  })
})
