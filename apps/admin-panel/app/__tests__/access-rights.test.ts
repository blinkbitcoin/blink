import {
  getAccessRightsForRole,
  getAccessRightsForRoles,
  hasAccessRight,
  hasAccessRightInRoles,
  hasAccessRightInScope,
  areValidAdminRoles,
  AdminAccessRight,
  type AdminRole,
} from "../access-rights"

describe("Access Rights - Multiple Roles Support", () => {
  describe("Single Role Functions (existing functionality)", () => {
    test("getAccessRightsForRole returns correct rights for VIEWER", () => {
      const rights = getAccessRightsForRole("VIEWER")
      expect(rights).toEqual(
        expect.arrayContaining([
          AdminAccessRight.VIEW_ACCOUNTS,
          AdminAccessRight.VIEW_TRANSACTIONS,
          AdminAccessRight.VIEW_MERCHANTS,
        ]),
      )
      expect(rights).toHaveLength(3)
    })

    test("getAccessRightsForRole returns correct rights for MARKETING_GLOBAL", () => {
      const rights = getAccessRightsForRole("MARKETING_GLOBAL")
      expect(rights).toEqual([AdminAccessRight.SEND_NOTIFICATIONS])
    })

    test("getAccessRightsForRole returns correct rights for SUPPORTLV1", () => {
      const rights = getAccessRightsForRole("SUPPORTLV1")
      expect(rights).toEqual(
        expect.arrayContaining([
          AdminAccessRight.VIEW_ACCOUNTS,
          AdminAccessRight.VIEW_MERCHANTS,
          AdminAccessRight.LOCK_ACCOUNT,
          AdminAccessRight.APPROVE_MERCHANT,
          AdminAccessRight.VIEW_TRANSACTIONS,
          AdminAccessRight.CHANGELEVEL_ACCOUNT,
        ]),
      )
      expect(rights).toHaveLength(6)
    })

    test("getAccessRightsForRole returns correct rights for SUPPORTLV2", () => {
      const rights = getAccessRightsForRole("SUPPORTLV2")
      expect(rights).toEqual(
        expect.arrayContaining([
          AdminAccessRight.VIEW_ACCOUNTS,
          AdminAccessRight.VIEW_MERCHANTS,
          AdminAccessRight.LOCK_ACCOUNT,
          AdminAccessRight.APPROVE_MERCHANT,
          AdminAccessRight.VIEW_TRANSACTIONS,
          AdminAccessRight.CHANGECONTACTS_ACCOUNT,
          AdminAccessRight.CHANGELEVEL_ACCOUNT,
        ]),
      )
      expect(rights).toHaveLength(7)
    })

    test("getAccessRightsForRole returns correct rights for ADMIN", () => {
      const rights = getAccessRightsForRole("ADMIN")
      expect(rights).toEqual(
        expect.arrayContaining([
          AdminAccessRight.VIEW_ACCOUNTS,
          AdminAccessRight.DELETE_ACCOUNTS,
          AdminAccessRight.VIEW_TRANSACTIONS,
          AdminAccessRight.SEND_NOTIFICATIONS,
          AdminAccessRight.SYSTEM_CONFIG,
          AdminAccessRight.APPROVE_MERCHANT,
          AdminAccessRight.CHANGECONTACTS_ACCOUNT,
          AdminAccessRight.CHANGELEVEL_ACCOUNT,
          AdminAccessRight.LOCK_ACCOUNT,
          AdminAccessRight.VIEW_MERCHANTS,
        ]),
      )
      expect(rights).toHaveLength(10) // All rights
    })

    test("hasAccessRight works correctly", () => {
      expect(hasAccessRight("VIEWER", AdminAccessRight.VIEW_ACCOUNTS)).toBe(true)
      expect(hasAccessRight("VIEWER", AdminAccessRight.DELETE_ACCOUNTS)).toBe(false)
      expect(hasAccessRight("ADMIN", AdminAccessRight.DELETE_ACCOUNTS)).toBe(true)

      // Test new granular rights
      expect(
        hasAccessRight("MARKETING_GLOBAL", AdminAccessRight.SEND_NOTIFICATIONS),
      ).toBe(true)
      expect(hasAccessRight("MARKETING_GLOBAL", AdminAccessRight.APPROVE_MERCHANT)).toBe(
        false,
      )
      expect(hasAccessRight("SUPPORTLV1", AdminAccessRight.APPROVE_MERCHANT)).toBe(true)
      expect(hasAccessRight("SUPPORTLV1", AdminAccessRight.CHANGELEVEL_ACCOUNT)).toBe(
        true,
      )
      expect(hasAccessRight("SUPPORTLV2", AdminAccessRight.CHANGELEVEL_ACCOUNT)).toBe(
        true,
      )
    })
  })

  describe("Multiple Roles Functions (new functionality)", () => {
    test("getAccessRightsForRoles combines rights from multiple roles", () => {
      const rights = getAccessRightsForRoles(["VIEWER", "MARKETING_GLOBAL"])
      expect(rights).toEqual(
        expect.arrayContaining([
          AdminAccessRight.VIEW_ACCOUNTS,
          AdminAccessRight.VIEW_TRANSACTIONS,
          AdminAccessRight.SEND_NOTIFICATIONS,
        ]),
      )
      expect(rights).toHaveLength(4) // No duplicates
    })

    test("getAccessRightsForRoles handles single role in array", () => {
      const rights = getAccessRightsForRoles(["VIEWER"])
      expect(rights).toEqual(
        expect.arrayContaining([
          AdminAccessRight.VIEW_ACCOUNTS,
          AdminAccessRight.VIEW_TRANSACTIONS,
          AdminAccessRight.VIEW_MERCHANTS,
        ]),
      )
      expect(rights).toHaveLength(3)
    })

    test("getAccessRightsForRoles handles all roles", () => {
      const rights = getAccessRightsForRoles([
        "VIEWER",
        "MARKETING_GLOBAL",
        "SUPPORTLV1",
        "SUPPORTLV2",
        "ADMIN",
      ])
      expect(rights).toEqual(
        expect.arrayContaining([
          AdminAccessRight.VIEW_ACCOUNTS,
          AdminAccessRight.DELETE_ACCOUNTS,
          AdminAccessRight.VIEW_TRANSACTIONS,
          AdminAccessRight.SEND_NOTIFICATIONS,
          AdminAccessRight.SYSTEM_CONFIG,
          AdminAccessRight.APPROVE_MERCHANT,
          AdminAccessRight.CHANGECONTACTS_ACCOUNT,
          AdminAccessRight.CHANGELEVEL_ACCOUNT,
          AdminAccessRight.LOCK_ACCOUNT,
          AdminAccessRight.VIEW_MERCHANTS,
        ]),
      )
      expect(rights).toHaveLength(10) // All unique rights
    })

    test("getAccessRightsForRoles handles empty array", () => {
      const rights = getAccessRightsForRoles([])
      expect(rights).toEqual([])
    })

    test("hasAccessRightInRoles works correctly", () => {
      expect(hasAccessRightInRoles(["VIEWER"], AdminAccessRight.VIEW_ACCOUNTS)).toBe(true)
      expect(hasAccessRightInRoles(["VIEWER"], AdminAccessRight.DELETE_ACCOUNTS)).toBe(
        false,
      )
      expect(
        hasAccessRightInRoles(["VIEWER", "ADMIN"], AdminAccessRight.DELETE_ACCOUNTS),
      ).toBe(true)
      expect(
        hasAccessRightInRoles(
          ["VIEWER", "MARKETING_GLOBAL"],
          AdminAccessRight.DELETE_ACCOUNTS,
        ),
      ).toBe(false)
    })

    test("areValidAdminRoles validates role arrays correctly", () => {
      expect(areValidAdminRoles(["VIEWER", "MARKETING_GLOBAL"])).toBe(true)
      expect(areValidAdminRoles(["MARKETING_GLOBAL", "SUPPORTLV1"])).toBe(true)
      expect(areValidAdminRoles(["SUPPORTLV2", "ADMIN"])).toBe(true)
      expect(areValidAdminRoles(["ADMIN"])).toBe(true)
      expect(areValidAdminRoles(["VIEWER", "INVALID"])).toBe(false)
      expect(areValidAdminRoles(["INVALID"])).toBe(false)
      expect(areValidAdminRoles([])).toBe(true) // Empty array is valid
    })
  })

  describe("Edge Cases", () => {
    test("duplicate roles in array are handled correctly", () => {
      const rights = getAccessRightsForRoles(["VIEWER", "VIEWER", "MARKETING_GLOBAL"])
      expect(rights).toEqual(
        expect.arrayContaining([
          AdminAccessRight.VIEW_ACCOUNTS,
          AdminAccessRight.VIEW_TRANSACTIONS,
          AdminAccessRight.SEND_NOTIFICATIONS,
        ]),
      )
      expect(rights).toHaveLength(4) // No duplicates despite duplicate roles
    })

    test("invalid role in getAccessRightsForRole returns empty array", () => {
      const rights = getAccessRightsForRole("INVALID" as AdminRole)
      expect(rights).toEqual([])
    })
  })

  describe("Scope Functions (space-separated format)", () => {
    test("hasAccessRightInScope works with space-separated string", () => {
      const scope = "VIEW_ACCOUNTS VIEW_TRANSACTIONS SEND_NOTIFICATIONS"
      expect(hasAccessRightInScope(scope, AdminAccessRight.VIEW_ACCOUNTS)).toBe(true)
      expect(hasAccessRightInScope(scope, AdminAccessRight.VIEW_TRANSACTIONS)).toBe(true)
      expect(hasAccessRightInScope(scope, AdminAccessRight.SEND_NOTIFICATIONS)).toBe(true)
      expect(hasAccessRightInScope(scope, AdminAccessRight.DELETE_ACCOUNTS)).toBe(false)
    })

    test("hasAccessRightInScope works with single permission", () => {
      const scope = "VIEW_ACCOUNTS"
      expect(hasAccessRightInScope(scope, AdminAccessRight.VIEW_ACCOUNTS)).toBe(true)
      expect(hasAccessRightInScope(scope, AdminAccessRight.DELETE_ACCOUNTS)).toBe(false)
    })

    test("hasAccessRightInScope works with empty string", () => {
      const scope = ""
      expect(hasAccessRightInScope(scope, AdminAccessRight.VIEW_ACCOUNTS)).toBe(false)
    })

    test("hasAccessRightInScope handles extra spaces", () => {
      const scope = "  VIEW_ACCOUNTS   VIEW_TRANSACTIONS  "
      expect(hasAccessRightInScope(scope, AdminAccessRight.VIEW_ACCOUNTS)).toBe(true)
      expect(hasAccessRightInScope(scope, AdminAccessRight.VIEW_TRANSACTIONS)).toBe(true)
    })
  })
})
