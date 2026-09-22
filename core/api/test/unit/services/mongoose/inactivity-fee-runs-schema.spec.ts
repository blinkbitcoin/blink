import { InactivityFeeRun } from "@/services/mongoose/schema"

// The repository is mocked in every other spec, so a path dropped or misspelled here would be
// stripped on write without failing anything: the run summary would silently lose a field.
describe("inactivityfeeruns schema", () => {
  it.each([
    ["runId", "String"],
    ["kind", "String"],
    ["asOf", "Date"],
    ["mode", "String"],
    ["forcedDry", "Boolean"],
    ["configVersion", "String"],
    ["skipListHash", "String"],
    ["scanned", "Number"],
    ["accountsWithoutClock", "Number"],
    ["error", "String"],
    // the fee run's own fields
    ["rate", "Number"],
    ["rateSource", "String"],
    ["debitedCount", "Number"],
    ["debitedSats", "Number"],
    ["debitedCents", "Number"],
    ["firstExternalIdSeen", "String"],
    ["lastExternalIdSeen", "String"],
  ])("declares %s as %s", (path, instance) => {
    expect(InactivityFeeRun.schema.path(path)?.instance).toBe(instance)
  })

  it.each(["countsByOutcome", "countsBySkipReason"])("declares %s", (path) => {
    expect(InactivityFeeRun.schema.path(path)).toBeDefined()
  })
})
