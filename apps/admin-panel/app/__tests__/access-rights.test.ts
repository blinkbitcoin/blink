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
      ])
    })

    test("getAccessRightsForRole returns correct rights for SUPPORT", () => {
      const rights = getAccessRightsForRole("SUPPORT")
      expect(rights).toEqual([
        AdminAccessRight.VIEW_ACCOUNTS,
        AdminAccessRight.MODIFY_ACCOUNTS,
        AdminAccessRight.VIEW_TRANSACTIONS,
        AdminAccessRight.SEND_NOTIFICATIONS,
      ])
    })

    test("getAccessRightsForRole returns correct rights for ADMIN", () => {
      const rights = getAccessRightsForRole("ADMIN")
      expect(rights).toEqual([
        AdminAccessRight.VIEW_ACCOUNTS,
        AdminAccessRight.MODIFY_ACCOUNTS,
        AdminAccessRight.DELETE_ACCOUNTS,
        AdminAccessRight.VIEW_TRANSACTIONS,
        AdminAccessRight.SEND_NOTIFICATIONS,
        AdminAccessRight.SYSTEM_CONFIG,
      ])
    })

    test("hasAccessRight works correctly", () => {
      expect(hasAccessRight("VIEWER", AdminAccessRight.VIEW_ACCOUNTS)).toBe(true)
      expect(hasAccessRight("VIEWER", AdminAccessRight.DELETE_ACCOUNTS)).toBe(false)
      expect(hasAccessRight("ADMIN", AdminAccessRight.DELETE_ACCOUNTS)).toBe(true)
    })
  })

  describe("Multiple Roles Functions (new functionality)", () => {
    test("getAccessRightsForRoles combines rights from multiple roles", () => {
      const rights = getAccessRightsForRoles(["VIEWER", "SUPPORT"])
      expect(rights).toEqual(
        expect.arrayContaining([
          AdminAccessRight.VIEW_ACCOUNTS,
          AdminAccessRight.MODIFY_ACCOUNTS,
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
      ])
    })

    test("getAccessRightsForRoles handles all roles", () => {
      const rights = getAccessRightsForRoles(["VIEWER", "SUPPORT", "ADMIN"])
      expect(rights).toEqual(
        expect.arrayContaining([
          AdminAccessRight.VIEW_ACCOUNTS,
          AdminAccessRight.MODIFY_ACCOUNTS,
          AdminAccessRight.DELETE_ACCOUNTS,
          AdminAccessRight.VIEW_TRANSACTIONS,
          AdminAccessRight.SEND_NOTIFICATIONS,
          AdminAccessRight.SYSTEM_CONFIG,
        ]),
      )
      expect(rights).toHaveLength(6) // All unique rights
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
        hasAccessRightInRoles(["VIEWER", "SUPPORT"], AdminAccessRight.DELETE_ACCOUNTS),
      ).toBe(false)
    })

    test("areValidAdminRoles validates role arrays correctly", () => {
      expect(areValidAdminRoles(["VIEWER", "SUPPORT"])).toBe(true)
      expect(areValidAdminRoles(["ADMIN"])).toBe(true)
      expect(areValidAdminRoles(["VIEWER", "INVALID"])).toBe(false)
      expect(areValidAdminRoles(["INVALID"])).toBe(false)
      expect(areValidAdminRoles([])).toBe(true) // Empty array is valid
    })
  })

  describe("Edge Cases", () => {
    test("duplicate roles in array are handled correctly", () => {
      const rights = getAccessRightsForRoles(["VIEWER", "VIEWER", "SUPPORT"])
      expect(rights).toEqual(
        expect.arrayContaining([
          AdminAccessRight.VIEW_ACCOUNTS,
          AdminAccessRight.MODIFY_ACCOUNTS,
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
