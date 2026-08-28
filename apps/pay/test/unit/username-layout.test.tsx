import { createElement } from "react"

import UsernameLayout from "../../app/[username]/layout"

import ErrorMessage from "@/components/error"

// This app's tsconfig program includes Cypress (Chai) types, whose global
// `expect` shadows jest's — re-alias it to jest's Expect type for this file.
const expect = globalThis.expect as unknown as jest.Expect

const mockRedirect = jest.fn((url: string): never => {
  throw new Error(`NEXT_REDIRECT ${url}`)
})
jest.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}))

const mockHeadersGet = jest.fn()
jest.mock("next/headers", () => ({
  headers: () => ({ get: (name: string) => mockHeadersGet(name) }),
}))

const mockQuery = jest.fn()
jest.mock("../../app/ssr-client", () => ({
  apollo: {
    unauthenticated: () => ({
      getClient: () => ({ query: mockQuery }),
    }),
  },
}))

jest.mock("../../app/currency-metadata", () => ({
  defaultCurrencyMetadata: {},
}))

const mockMigratedTerminalUrl = jest.fn()
jest.mock("../../app/[username]/migrated-terminal-url", () => ({
  migratedTerminalUrl: (username: string, subpath?: string, search?: string) =>
    mockMigratedTerminalUrl(username, subpath, search),
}))

jest.mock("@/components/layouts/username-layout", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock("@/context/invoice-context", () => ({
  InvoiceProvider: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock("@/lib/graphql/generated", () => ({
  AccountDefaultWalletsDocument: {},
}))

jest.mock("@/components/error", () => ({
  __esModule: true,
  // Element props are asserted structurally in the tests; the mock never
  // renders, so it takes no params.
  default: function MockErrorMessage() {
    return null
  },
}))

const renderLayout = (username: string) =>
  UsernameLayout({ children: createElement("div"), params: { username } })

describe("UsernameLayout error branch", () => {
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    // The layout console.errors on every lookup failure; silence the noise.
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined)
    mockQuery.mockRejectedValue(new Error("Account is inactive."))
    mockHeadersGet.mockReturnValue(null)
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it("redirects to Terminal for a migrated username, preserving /print and the query string", async () => {
    mockHeadersGet.mockImplementation((name: string) =>
      name === "x-pathname"
        ? "/alice/print"
        : name === "x-search"
          ? "?amount=21&display=USD"
          : null,
    )
    mockMigratedTerminalUrl.mockResolvedValue(
      "https://terminal.blinkbtc.com/alice/print?amount=21&display=USD",
    )

    await expect(renderLayout("alice")).rejects.toThrow(
      "NEXT_REDIRECT https://terminal.blinkbtc.com/alice/print?amount=21&display=USD",
    )
    expect(mockMigratedTerminalUrl).toHaveBeenCalledWith(
      "alice",
      "/print",
      "?amount=21&display=USD",
    )
  })

  it("forwards the query string on the bare route (no subpath)", async () => {
    mockHeadersGet.mockImplementation((name: string) =>
      name === "x-pathname" ? "/alice" : name === "x-search" ? "?display=EUR" : null,
    )
    mockMigratedTerminalUrl.mockResolvedValue(
      "https://terminal.blinkbtc.com/alice?display=EUR",
    )

    await expect(renderLayout("alice")).rejects.toThrow(
      "NEXT_REDIRECT https://terminal.blinkbtc.com/alice?display=EUR",
    )
    expect(mockMigratedTerminalUrl).toHaveBeenCalledWith("alice", "", "?display=EUR")
  })

  it("collapses /transaction to the profile root (no Terminal equivalent)", async () => {
    mockHeadersGet.mockImplementation((name: string) =>
      name === "x-pathname" ? "/alice/transaction" : null,
    )
    mockMigratedTerminalUrl.mockResolvedValue("https://terminal.blinkbtc.com/alice")

    await expect(renderLayout("alice")).rejects.toThrow("NEXT_REDIRECT")
    expect(mockMigratedTerminalUrl).toHaveBeenCalledWith("alice", "", "")
  })

  it("treats missing path headers as the profile root", async () => {
    mockMigratedTerminalUrl.mockResolvedValue("https://terminal.blinkbtc.com/alice")

    await expect(renderLayout("alice")).rejects.toThrow("NEXT_REDIRECT")
    expect(mockMigratedTerminalUrl).toHaveBeenCalledWith("alice", "", "")
  })

  it("renders ErrorMessage when the username was not migrated", async () => {
    mockQuery.mockRejectedValue(new Error("Account does not exist for username ghost"))
    mockMigratedTerminalUrl.mockResolvedValue(null)

    const ui = (await renderLayout("ghost")) as unknown as {
      type: unknown
      props: { errorMessage: string }
    }
    expect(ui.type).toBe(ErrorMessage)
    expect(ui.props.errorMessage).toBe("Account does not exist for username ghost")
  })

  it("renders children when the username lookup succeeds", async () => {
    mockQuery.mockResolvedValue({
      data: { accountDefaultWallet: { walletCurrency: "BTC", id: "wallet-1" } },
    })

    const ui = (await renderLayout("alice")) as unknown as {
      type: { name?: string }
      props: { children?: unknown }
    }
    expect(ui).toBeTruthy()
    expect(mockMigratedTerminalUrl).not.toHaveBeenCalled()
  })
})
