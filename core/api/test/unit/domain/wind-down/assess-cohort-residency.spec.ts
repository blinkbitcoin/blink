import { assessCohortResidency } from "@/domain/wind-down"

// arbitrary non-deployed codes: KE is strict and affected, FJ/VU strict only,
// MX/AR/CO affected only, GT/HN/BR/TH neither
const args = (
  overrides: Partial<AssessCohortResidencyArgs> = {},
): AssessCohortResidencyArgs => ({
  phoneCountry: undefined,
  newestDeletedPhoneCountry: undefined,
  creationIpCountry: undefined,
  latestIpCountry: undefined,
  affectedCountries: ["MX", "AR", "CO", "KE"],
  strictCountries: ["KE", "FJ", "VU"],
  ...overrides,
})

describe("assessCohortResidency", () => {
  describe("strict scan", () => {
    it("locks on a strict creation IP even when phone and latest IP are non-affected", () => {
      expect(
        assessCohortResidency(
          args({ phoneCountry: "GT", creationIpCountry: "KE", latestIpCountry: "GT" }),
        ),
      ).toEqual({ matched: true, assignedCountry: "KE", rule: "strict-list" })
    })

    it("locks on a strict creation IP while the latest IP is merely affected", () => {
      expect(
        assessCohortResidency(
          args({ phoneCountry: "BR", creationIpCountry: "KE", latestIpCountry: "MX" }),
        ),
      ).toEqual({ matched: true, assignedCountry: "KE", rule: "strict-list" })
    })

    it("holds a strict phone against a same-country non-affected IP pair — no override", () => {
      expect(
        assessCohortResidency(
          args({ phoneCountry: "FJ", creationIpCountry: "GT", latestIpCountry: "GT" }),
        ),
      ).toEqual({ matched: true, assignedCountry: "FJ", rule: "strict-list" })
    })

    it("holds a strict AND affected phone against the same-country release pair", () => {
      // the release would fire for this affected primary if the strict scan did not run first
      expect(
        assessCohortResidency(
          args({ phoneCountry: "KE", creationIpCountry: "GT", latestIpCountry: "GT" }),
        ),
      ).toEqual({ matched: true, assignedCountry: "KE", rule: "strict-list" })
    })

    it("locks on a strict newest deleted phone regardless of IPs", () => {
      expect(
        assessCohortResidency(
          args({
            newestDeletedPhoneCountry: "FJ",
            creationIpCountry: "GT",
            latestIpCountry: "GT",
          }),
        ),
      ).toEqual({ matched: true, assignedCountry: "FJ", rule: "strict-list" })
    })

    it("assigns the strict phone over a strict creation IP — signal-order precedence", () => {
      expect(
        assessCohortResidency(args({ phoneCountry: "FJ", creationIpCountry: "KE" })),
      ).toEqual({ matched: true, assignedCountry: "FJ", rule: "strict-list" })
    })

    it("assigns the strict newest deleted over a strict creation IP", () => {
      expect(
        assessCohortResidency(
          args({
            phoneCountry: "GT",
            newestDeletedPhoneCountry: "KE",
            creationIpCountry: "FJ",
          }),
        ),
      ).toEqual({ matched: true, assignedCountry: "KE", rule: "strict-list" })
    })

    it("never includes on the latest IP, even a strict one", () => {
      expect(
        assessCohortResidency(
          args({ phoneCountry: "GT", creationIpCountry: "GT", latestIpCountry: "KE" }),
        ),
      ).toEqual({ matched: false, assignedCountry: "GT", rule: "hierarchy" })
    })
  })

  describe("exclusion override", () => {
    it("releases an affected phone when both IPs agree on the same non-affected country", () => {
      expect(
        assessCohortResidency(
          args({ phoneCountry: "MX", creationIpCountry: "GT", latestIpCountry: "GT" }),
        ),
      ).toEqual({ matched: false, assignedCountry: "GT", rule: "exclusion-override" })
    })

    it("releases an affected newest deleted phone through the same-country IP pair", () => {
      expect(
        assessCohortResidency(
          args({
            newestDeletedPhoneCountry: "CO",
            creationIpCountry: "GT",
            latestIpCountry: "GT",
          }),
        ),
      ).toEqual({ matched: false, assignedCountry: "GT", rule: "exclusion-override" })
    })

    it("keeps an affected phone when the two non-affected IPs disagree", () => {
      expect(
        assessCohortResidency(
          args({ phoneCountry: "MX", creationIpCountry: "GT", latestIpCountry: "HN" }),
        ),
      ).toEqual({ matched: true, assignedCountry: "MX", rule: "hierarchy" })
    })

    it("keeps an affected phone when the equal IP pair is itself affected", () => {
      expect(
        assessCohortResidency(
          args({ phoneCountry: "MX", creationIpCountry: "AR", latestIpCountry: "AR" }),
        ),
      ).toEqual({ matched: true, assignedCountry: "MX", rule: "hierarchy" })
    })

    it("keeps the override inert when the latest IP is absent", () => {
      expect(
        assessCohortResidency(args({ phoneCountry: "MX", creationIpCountry: "GT" })),
      ).toEqual({ matched: true, assignedCountry: "MX", rule: "hierarchy" })
    })

    it("keeps the override inert when the creation IP is absent", () => {
      expect(
        assessCohortResidency(args({ phoneCountry: "MX", latestIpCountry: "GT" })),
      ).toEqual({ matched: true, assignedCountry: "MX", rule: "hierarchy" })
    })
  })

  describe("hierarchy", () => {
    it("does not let affected IPs pull in a non-affected primary phone", () => {
      expect(
        assessCohortResidency(
          args({ phoneCountry: "BR", creationIpCountry: "AR", latestIpCountry: "MX" }),
        ),
      ).toEqual({ matched: false, assignedCountry: "BR", rule: "hierarchy" })
    })

    it("releases a non-affected newest deleted phone without consulting IPs", () => {
      expect(
        assessCohortResidency(
          args({
            newestDeletedPhoneCountry: "HN",
            creationIpCountry: "GT",
            latestIpCountry: "GT",
          }),
        ),
      ).toEqual({ matched: false, assignedCountry: "HN", rule: "hierarchy" })
    })

    it("matches on the creation IP alone; a differing latest IP is not an override", () => {
      expect(
        assessCohortResidency(args({ creationIpCountry: "MX", latestIpCountry: "TH" })),
      ).toEqual({ matched: true, assignedCountry: "MX", rule: "hierarchy" })
    })

    it("prefers the current phone over the newest deleted phone as primary", () => {
      expect(
        assessCohortResidency(
          args({ phoneCountry: "GT", newestDeletedPhoneCountry: "MX" }),
        ),
      ).toEqual({ matched: false, assignedCountry: "GT", rule: "hierarchy" })
    })

    it("falls through an absent newest deleted phone to the creation IP", () => {
      expect(assessCohortResidency(args({ creationIpCountry: "GT" }))).toEqual({
        matched: false,
        assignedCountry: "GT",
        rule: "hierarchy",
      })
    })

    it("lets the creation IP match through an absent newest deleted phone", () => {
      expect(assessCohortResidency(args({ creationIpCountry: "MX" }))).toEqual({
        matched: true,
        assignedCountry: "MX",
        rule: "hierarchy",
      })
    })

    it("returns no assigned country when there is no signal at all", () => {
      expect(assessCohortResidency(args())).toEqual({
        matched: false,
        rule: "hierarchy",
      })
    })
  })

  describe("case-insensitivity", () => {
    it("matches a lowercase phone country against a mixed-case affected list", () => {
      expect(
        assessCohortResidency(
          args({ phoneCountry: "mx", affectedCountries: ["mX"], strictCountries: [] }),
        ),
      ).toEqual({ matched: true, assignedCountry: "MX", rule: "hierarchy" })
    })

    it("locks a lowercase phone country against a lowercase strict list", () => {
      expect(
        assessCohortResidency(args({ phoneCountry: "fj", strictCountries: ["fj"] })),
      ).toEqual({ matched: true, assignedCountry: "FJ", rule: "strict-list" })
    })

    it("assigns the normalized IP country on an exclusion override", () => {
      expect(
        assessCohortResidency(
          args({ phoneCountry: "MX", creationIpCountry: "gt", latestIpCountry: "gt" }),
        ),
      ).toEqual({ matched: false, assignedCountry: "GT", rule: "exclusion-override" })
    })
  })
})
