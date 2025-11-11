import {
  checkedToContactId,
  checkedToHandle,
  checkedToDisplayName,
} from "@/domain/contacts"
<<<<<<< HEAD
import { InvalidContactIdError, InvalidHandleError } from "@/domain/contacts/errors"
=======
import {
  InvalidContactIdError,
  InvalidDisplayNameError,
  InvalidHandleError,
} from "@/domain/contacts/errors"
>>>>>>> upstream/main

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

  it("fails when handle is invalid as both username and lightning address", () => {
    const result = checkedToHandle("invalid handle!")
    expect(result).toBeInstanceOf(InvalidHandleError)
  })

  it("fails when handle is empty", () => {
    const result = checkedToHandle("")
    expect(result).toBeInstanceOf(InvalidHandleError)
  })

  it("fails when handle is too long", () => {
    const longHandle = "a".repeat(300)
    const result = checkedToHandle(longHandle)
    expect(result).toBeInstanceOf(InvalidHandleError)
  })
})

describe("checkedToDisplayName", () => {
  it("returns display name when valid", () => {
    const result = checkedToDisplayName("John Doe")
    expect(result).toBe("John Doe")
  })

  it("fails when display name does not match pattern", () => {
    const result = checkedToDisplayName("1Invalid Name")
<<<<<<< HEAD
    expect(result).toBeInstanceOf(InvalidHandleError)
=======
    expect(result).toBeInstanceOf(InvalidDisplayNameError)
>>>>>>> upstream/main
  })

  it("fails when display name is too short", () => {
    const result = checkedToDisplayName("A")
<<<<<<< HEAD
    expect(result).toBeInstanceOf(InvalidHandleError)
=======
    expect(result).toBeInstanceOf(InvalidDisplayNameError)
>>>>>>> upstream/main
  })
})
