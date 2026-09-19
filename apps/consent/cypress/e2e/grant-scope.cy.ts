import { extraGrantScopes } from "../../app/consent/grant-scope"

// `extraGrantScopes` decides whether the granted scopes are a subset of the
// requested ones. Pure function, pinned here; no browser needed.
describe("extraGrantScopes", () => {
  it("returns nothing when granted equals requested", () => {
    expect(extraGrantScopes(["read", "write"], ["read", "write"])).to.deep.equal([])
  })

  it("returns nothing when granted is a strict subset of requested", () => {
    expect(extraGrantScopes(["read"], ["read", "write"])).to.deep.equal([])
  })

  it("returns nothing when nothing was granted", () => {
    expect(extraGrantScopes([], ["read"])).to.deep.equal([])
  })

  it("returns exactly the scopes that were granted but not requested", () => {
    expect(extraGrantScopes(["read", "write", "offline"], ["read"])).to.deep.equal([
      "write",
      "offline",
    ])
  })

  it("treats every granted scope as extra when nothing was requested", () => {
    expect(extraGrantScopes(["read", "write"], [])).to.deep.equal(["read", "write"])
  })

  it("is case sensitive: a differently cased scope is not the requested one", () => {
    expect(extraGrantScopes(["READ"], ["read"])).to.deep.equal(["READ"])
  })

  it("does not match on prefixes or substrings", () => {
    expect(extraGrantScopes(["read:all", "rea"], ["read"])).to.deep.equal([
      "read:all",
      "rea",
    ])
  })

  it("does not treat whitespace variants as the requested scope", () => {
    expect(extraGrantScopes([" read", "read "], ["read"])).to.deep.equal([
      " read",
      "read ",
    ])
  })

  it("reports a repeated extra scope each time it appears", () => {
    expect(extraGrantScopes(["write", "write"], ["read"])).to.deep.equal([
      "write",
      "write",
    ])
  })

  it("does not mutate its inputs", () => {
    const granted = ["read", "write"]
    const requested = ["read"]
    extraGrantScopes(granted, requested)
    expect(granted).to.deep.equal(["read", "write"])
    expect(requested).to.deep.equal(["read"])
  })
})
