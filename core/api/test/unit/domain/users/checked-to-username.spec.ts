import { checkedToUsername } from "@/domain/accounts"

describe("username-check", () => {
  it("Passes alphanumeric username", () => {
    const username = checkedToUsername("alice_12")
    expect(username).toEqual("alice_12")
  })

  it("Passes username with letters only", () => {
    const username = checkedToUsername("alice")
    expect(username).toEqual("alice")
  })

  it("Passes username with numbers and at least one letter", () => {
    const username = checkedToUsername("9a456")
    expect(username).toEqual("9a456")
  })

  it("Passes username with letter at the end", () => {
    const username = checkedToUsername("2468z")
    expect(username).toEqual("2468z")
  })

  it("Passes underscore in middle", () => {
    const username = checkedToUsername("user_123")
    expect(username).toEqual("user_123")
  })

  it("Fails if contains only digits", () => {
    const username = checkedToUsername("639456")
    expect(username).toBeInstanceOf(Error)
  })

  it("Fails legacy address", () => {
    const username = checkedToUsername("1LKvxGL8ejTsgBjRVUNCGi7adiwaVnM9cn")
    expect(username).toBeInstanceOf(Error)
  })

  it("Fails if starting with 1", () => {
    const username = checkedToUsername("1ab")
    expect(username).toBeInstanceOf(Error)
  })

  it("Fails if starting with 3", () => {
    const username = checkedToUsername("3basd")
    expect(username).toBeInstanceOf(Error)
  })

  it("Fails if starting with _", () => {
    const username = checkedToUsername("_hidden")
    expect(username).toBeInstanceOf(Error)
  })

  it("Fails if starting with +", () => {
    const username = checkedToUsername("+573001234567")
    expect(username).toBeInstanceOf(Error)
  })

  it("Fails wrapped segwit address", () => {
    const username = checkedToUsername("32ksNi7zSt3t2aesvoEWhGMUEwCFg9UCCG")
    expect(username).toBeInstanceOf(Error)
  })

  it("Fails segwit address", () => {
    const username = checkedToUsername("bc1qpl8ehyzu44yhwu92w892uxwxdfp9dhu3d0zj2g")
    expect(username).toBeInstanceOf(Error)
  })

  it("Fails if starting with bc1", () => {
    const username = checkedToUsername("bc1be")
    expect(username).toBeInstanceOf(Error)
  })

  it("Fails lightning payment request", () => {
    const username = checkedToUsername(
      "lnbc1500n1ps36h3rpp5qtgvy47pu6n3t2ggf47vahl3kdjql0d68egtaschvd34atvu5eysdpa2fjkzep6ypyx7aeqw3hjqct4w3hk6ct5d93kzmrv0ys82uryv96x2greda6hycqzpgxqr23ssp5makumjtdy54vz80ayytgld7420uuw5m6pdtq5x2n38gg7z5gd9ms9qyyssq64faagqrfa6qp45jsx8enwgs62fquqfejxk0gmtuf67z7v7d9364c5tw679cd635nmllfwzur348whvrgnf94sx6w40n6ttwa4x8grcqa0ms0d",
    )
    expect(username).toBeInstanceOf(Error)
  })

  it("Fails if starting with lnbc1", () => {
    const username = checkedToUsername("lnbc1qwe1")
    expect(username).toBeInstanceOf(Error)
  })

  it("Fails non-underscore special characters", () => {
    const username = checkedToUsername("alice-12")
    expect(username).toBeInstanceOf(Error)
  })

  it("Fails if length is less than 3", () => {
    const username = checkedToUsername("ab")
    expect(username).toBeInstanceOf(Error)
  })

  it("Fails if contains invalid characters", () => {
    const username = checkedToUsername("ab+/")
    expect(username).toBeInstanceOf(Error)
  })

  it("Fails if non english characters", () => {
    const username = checkedToUsername("ñ_user1")
    expect(username).toBeInstanceOf(Error)
  })

  it("Fails if only underscores", () => {
    const username = checkedToUsername("___")
    expect(username).toBeInstanceOf(Error)
  })

  it("Fails if no letters", () => {
    const username = checkedToUsername("456_789")
    expect(username).toBeInstanceOf(Error)
  })

  it("Fails if longer than 50 characters", () => {
    const username = checkedToUsername("a".repeat(51))
    expect(username).toBeInstanceOf(Error)
  })

  it("Passes if exactly 50 characters and valid", () => {
    const username = checkedToUsername("b1".repeat(25))
    expect(username).toEqual("b1".repeat(25))
  })

  it("Passes if has at least one lowercase among uppercase", () => {
    let username = checkedToUsername("Abc123")
    expect(username).toEqual("abc123")
    username = checkedToUsername("ABC123")
    expect(username).toEqual("abc123")
  })

  it("Fails on undefined input", () => {
    const username = checkedToUsername(undefined as unknown as string)
    expect(username).toBeInstanceOf(Error)
  })

  it("Fails on null input", () => {
    const username = checkedToUsername(null as unknown as string)
    expect(username).toBeInstanceOf(Error)
  })

  it("Fails on empty string", () => {
    const username = checkedToUsername("")
    expect(username).toBeInstanceOf(Error)
  })
})
