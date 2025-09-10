import {
  getAccessRightsForRole,
  getAccessRightsForRoles,
  hasAccessRight,
  hasAccessRightInRoles,
  areValidAdminRoles,
  AdminAccessRight,
  type AdminRole,
} from "../access-rights"

describe("Access Rights - Multiple Roles Support", () => {
  describe("Single Role Functions (existing functionality)", () => {
    test("getAccessRightsForRole returns correct rights for VIEWER", () => {
      const rights = getAccessRightsForRole("VIEWER")
      expect(rights).toEqual([
        AdminAccessRight.VIEW_ACCOUNTS,
        AdminAccessRight.VIEW_TRANSACTIONS,
        AdminAccessRight.VIEW_MERCHANTS,
      ])
    })

    test("getAccessRightsForRole returns correct rights for MARKETING", () => {
      const rights = getAccessRightsForRole("MARKETING")
      expect(rights).toEqual([AdminAccessRight.SEND_NOTIFICATIONS])
    })

    test("getAccessRightsForRole returns correct rights for SUPPORTLV1", () => {
      const rights = getAccessRightsForRole("SUPPORTLV1")
      expect(rights).toEqual([
        AdminAccessRight.VIEW_ACCOUNTS,
        AdminAccessRight.VIEW_MERCHANTS,
        AdminAccessRight.LOCK_ACCOUNT,
        AdminAccessRight.APPROVE_MERCHANT,
        AdminAccessRight.VIEW_TRANSACTIONS,
      ])
    })

    test("getAccessRightsForRole returns correct rights for SUPPORTLV2", () => {
      const rights = getAccessRightsForRole("SUPPORTLV2")
      expect(rights).toEqual([
        AdminAccessRight.VIEW_ACCOUNTS,
        AdminAccessRight.VIEW_MERCHANTS,
        AdminAccessRight.LOCK_ACCOUNT,
        AdminAccessRight.APPROVE_MERCHANT,
        AdminAccessRight.VIEW_TRANSACTIONS,
        AdminAccessRight.CHANGECONTACTS_ACCOUNT,
        AdminAccessRight.CHANGELEVEL_ACCOUNT,
      ])
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
      expect(hasAccessRight("MARKETING", AdminAccessRight.SEND_NOTIFICATIONS)).toBe(true)
      expect(hasAccessRight("MARKETING", AdminAccessRight.APPROVE_MERCHANT)).toBe(false)
      expect(hasAccessRight("SUPPORTLV1", AdminAccessRight.APPROVE_MERCHANT)).toBe(true)
      expect(hasAccessRight("SUPPORTLV1", AdminAccessRight.CHANGELEVEL_ACCOUNT)).toBe(
        false,
      )
      expect(hasAccessRight("SUPPORTLV2", AdminAccessRight.CHANGELEVEL_ACCOUNT)).toBe(
        true,
      )
    })
  })

  describe("Multiple Roles Functions (new functionality)", () => {
    test("getAccessRightsForRoles combines rights from multiple roles", () => {
      const rights = getAccessRightsForRoles(["VIEWER", "MARKETING"])
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
      expect(rights).toEqual([
        AdminAccessRight.VIEW_ACCOUNTS,
        AdminAccessRight.VIEW_TRANSACTIONS,
        AdminAccessRight.VIEW_MERCHANTS,
      ])
    })

    test("getAccessRightsForRoles handles all roles", () => {
      const rights = getAccessRightsForRoles([
        "VIEWER",
        "MARKETING",
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
        hasAccessRightInRoles(["VIEWER", "MARKETING"], AdminAccessRight.DELETE_ACCOUNTS),
      ).toBe(false)
    })

    test("areValidAdminRoles validates role arrays correctly", () => {
      expect(areValidAdminRoles(["VIEWER", "MARKETING"])).toBe(true)
      expect(areValidAdminRoles(["MARKETING", "SUPPORTLV1"])).toBe(true)
      expect(areValidAdminRoles(["SUPPORTLV2", "ADMIN"])).toBe(true)
      expect(areValidAdminRoles(["ADMIN"])).toBe(true)
      expect(areValidAdminRoles(["VIEWER", "INVALID"])).toBe(false)
      expect(areValidAdminRoles(["INVALID"])).toBe(false)
      expect(areValidAdminRoles([])).toBe(true) // Empty array is valid
    })
  })

  describe("Edge Cases", () => {
    test("duplicate roles in array are handled correctly", () => {
      const rights = getAccessRightsForRoles(["VIEWER", "VIEWER", "MARKETING"])
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
})
