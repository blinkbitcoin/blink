import {
  checkedToContactId,
  checkedToHandle,
  checkedToDisplayName,
  contactToAccountContact,
  localUsernameFromHandle,
} from "@/domain/contacts"
import {
  InvalidContactIdError,
  InvalidDisplayNameError,
  InvalidHandleError,
  NoLocalUsernameForHandleError,
} from "@/domain/contacts/errors"

describe("checkedToContactId", () => {
  it("returns contactId when valid UUID", () => {
    const uuid = "a7bcb7e6-4d2e-4d99-bad9-6a0ee2900c90"
    const result = checkedToContactId(uuid)
    expect(result).toBe(uuid)
  })

  it("returns InvalidContactIdError when not a UUID", () => {
    const result = checkedToContactId("invalid-id")
    expect(result).toBeInstanceOf(InvalidContactIdError)
  })
})

describe("checkedToHandle", () => {
  it("returns handle when valid username", () => {
    const result = checkedToHandle("valid_username")
    expect(result).toBe("valid_username")
  })

  it("returns handle when valid lightning address", () => {
    const result = checkedToHandle("user@domain.com")
    expect(result).toBe("user@domain.com")
  })

  it("returns handle when username is at upper bound length", () => {
    const result = checkedToHandle("a".repeat(50))
    expect(result).toBe("a".repeat(50))
  })

  it("returns handle when lightning address is at upper bound", () => {
    const result = checkedToHandle("x".repeat(30) + "@domain.com")
    expect(result).toBe("x".repeat(30) + "@domain.com")
  })

  it("lowercases a username", () => {
    const result = checkedToHandle("ValidUsername")
    expect(result).toBe("validusername")
  })

  it("lowercases a lightning address", () => {
    const result = checkedToHandle("Alice@Blink.SV")
    expect(result).toBe("alice@blink.sv")
  })

  it("trims surrounding whitespace", () => {
    const result = checkedToHandle("  alice@blink.sv  ")
    expect(result).toBe("alice@blink.sv")
  })

  it("fails when handle is invalid as both username and lightning address", () => {
    const result = checkedToHandle("invalid handle!")
    expect(result).toBeInstanceOf(InvalidHandleError)
  })

  it("fails when handle is empty", () => {
    const result = checkedToHandle("")
    expect(result).toBeInstanceOf(InvalidHandleError)
  })

  it("fails when handle is only whitespace", () => {
    const result = checkedToHandle("   ")
    expect(result).toBeInstanceOf(InvalidHandleError)
  })

  it("fails when handle is too long", () => {
    const longHandle = "a".repeat(300)
    const result = checkedToHandle(longHandle)
    expect(result).toBeInstanceOf(InvalidHandleError)
  })

  it("reports the original value in the error", () => {
    const result = checkedToHandle(" Invalid Handle! ")
    expect(result).toHaveProperty("message", " Invalid Handle! ")
  })
})

describe("localUsernameFromHandle", () => {
  const lnAddressDomain = "blink.sv"

  it("returns a bare username unchanged", () => {
    const result = localUsernameFromHandle({
      handle: "legacyuser" as Handle,
      lnAddressDomain,
    })
    expect(result).toBe("legacyuser")
  })

  it("normalizes a bare username stored before handles were lowercased", () => {
    const result = localUsernameFromHandle({
      handle: "LegacyUser" as Handle,
      lnAddressDomain,
    })
    expect(result).toBe("legacyuser")
  })

  it("fails for a bare handle that is not a valid username", () => {
    const result = localUsernameFromHandle({
      handle: "@blink.sv" as Handle,
      lnAddressDomain,
    })
    expect(result).toBeInstanceOf(NoLocalUsernameForHandleError)
  })

  it("returns the local part of an address hosted by this instance", () => {
    const result = localUsernameFromHandle({
      handle: "alice@blink.sv" as Handle,
      lnAddressDomain,
    })
    expect(result).toBe("alice")
  })

  it("matches the configured domain regardless of case", () => {
    const result = localUsernameFromHandle({
      handle: "alice@blink.sv" as Handle,
      lnAddressDomain: "Blink.SV",
    })
    expect(result).toBe("alice")
  })

  it("matches the domain of a handle that was stored before normalization", () => {
    const result = localUsernameFromHandle({
      handle: "alice@Blink.SV" as Handle,
      lnAddressDomain,
    })
    expect(result).toBe("alice")
  })

  it("matches the configured domain with surrounding whitespace", () => {
    const result = localUsernameFromHandle({
      handle: "alice@blink.sv" as Handle,
      lnAddressDomain: " blink.sv ",
    })
    expect(result).toBe("alice")
  })

  it("fails for an address hosted by another wallet", () => {
    const result = localUsernameFromHandle({
      handle: "bob@otherwallet.example" as Handle,
      lnAddressDomain,
    })
    expect(result).toBeInstanceOf(NoLocalUsernameForHandleError)
  })

  it("fails for an address whose domain merely ends with the local one", () => {
    const result = localUsernameFromHandle({
      handle: "bob@evilblink.sv" as Handle,
      lnAddressDomain,
    })
    expect(result).toBeInstanceOf(NoLocalUsernameForHandleError)
  })

  it("fails when the local part is not a valid username", () => {
    const result = localUsernameFromHandle({
      handle: "+50300000000@blink.sv" as Handle,
      lnAddressDomain,
    })
    expect(result).toBeInstanceOf(NoLocalUsernameForHandleError)
  })

  it("splits on the last separator of a multi-part address", () => {
    const result = localUsernameFromHandle({
      handle: "alice@bob@blink.sv" as Handle,
      lnAddressDomain,
    })
    expect(result).toBeInstanceOf(NoLocalUsernameForHandleError)
  })
})

describe("contactToAccountContact", () => {
  const contact = {
    id: "contact-id" as ContactId,
    createdAt: new Date(),
    accountId: "account-id" as AccountId,
    type: "LNADDRESS" as ContactType,
    handle: "alice@blink.sv" as Handle,
    displayName: "Alice" as ContactAlias,
    transactionsCount: 11,
  }

  it("exposes the handle as id, username and handle", () => {
    const result = contactToAccountContact(contact)
    expect(result).toEqual({
      id: "alice@blink.sv",
      username: "alice@blink.sv",
      handle: "alice@blink.sv",
      alias: "Alice",
      transactionsCount: 11,
    })
  })
})

describe("checkedToDisplayName", () => {
  it("returns display name when valid", () => {
    const result = checkedToDisplayName("John Doe")
    expect(result).toBe("John Doe")
  })

  it("fails when display name does not match pattern", () => {
    const result = checkedToDisplayName("1Invalid Name")
    expect(result).toBeInstanceOf(InvalidDisplayNameError)
  })

  it("fails when display name is too short", () => {
    const result = checkedToDisplayName("A")
    expect(result).toBeInstanceOf(InvalidDisplayNameError)
  })
})
