import { createHash } from "crypto"

import { hashPhone } from "@/services/phone-hash"

describe("hashPhone", () => {
  const phone = "+14155550123" as PhoneNumber

  it("is a sha256 digest of the bare phone number", () => {
    const expected = createHash("sha256").update(phone).digest("hex")

    expect(hashPhone(phone)).toBe(expected)
  })

  it("is deterministic so digests can be correlated across events", () => {
    expect(hashPhone(phone)).toBe(hashPhone(phone))
  })

  it("does not expose the phone number", () => {
    expect(hashPhone(phone)).not.toContain(phone)
  })

  it("maps different phone numbers to different digests", () => {
    expect(hashPhone(phone)).not.toBe(hashPhone("+14155550124" as PhoneNumber))
  })
})
