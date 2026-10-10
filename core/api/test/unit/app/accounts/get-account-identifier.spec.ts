jest.mock("@/config", () => ({
  LNURL_SERVER_LN_ADDRESS_DOMAIN: "wallet.blink.test",
  LNURL_SERVER_INTERNAL_URL: "http://lnurl-server.test",
}))

jest.mock("@/services/lnurl-server", () => ({
  LnurlServerService: jest.fn(),
}))

import { getAccountIdentifier } from "@/app/accounts/get-account-identifier"

import {
  LnurlServerMissingInternalUrlError,
  LnurlServerNotFoundError,
  LnurlServerUnavailableError,
} from "@/domain/lnurl-server"
import { LnurlServerService } from "@/services/lnurl-server"

const mockLnurlServerService = LnurlServerService as jest.MockedFunction<
  typeof LnurlServerService
>

const lnurlServerService = (
  overrides: Partial<Record<keyof ILnurlServerService, jest.Mock>>,
): ILnurlServerService =>
  ({
    createBlinkAccount: jest.fn(),
    updateDefaultWallet: jest.fn(),
    getIdentifier: jest.fn(),
    transferIdentifierToSpark: jest.fn(),
    ...overrides,
  }) as unknown as ILnurlServerService

const username = "twentyone" as Username

describe("getAccountIdentifier", () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it("returns exists:false with null provider when lnurl-server is not configured", async () => {
    mockLnurlServerService.mockReturnValue(
      new LnurlServerMissingInternalUrlError("empty"),
    )

    const result = await getAccountIdentifier(username)

    expect(result).toEqual({ exists: false, provider: null })
  })

  it("returns exists:false with null provider when the identifier is not found", async () => {
    const getIdentifier = jest.fn().mockResolvedValue(new LnurlServerNotFoundError())
    mockLnurlServerService.mockReturnValue(lnurlServerService({ getIdentifier }))

    const result = await getAccountIdentifier(username)

    expect(result).toEqual({ exists: false, provider: null })
  })

  it("returns exists:true with the provider for a spark identifier", async () => {
    const getIdentifier = jest
      .fn()
      .mockResolvedValue({ provider: "spark" } as LnurlServerIdentifier)
    mockLnurlServerService.mockReturnValue(lnurlServerService({ getIdentifier }))

    const result = await getAccountIdentifier(username)

    expect(result).toEqual({ exists: true, provider: "spark" })
    expect(getIdentifier).toHaveBeenCalledWith({
      domain: "wallet.blink.test",
      identifier: username,
    })
  })

  it("propagates unexpected lnurl-server errors", async () => {
    const getIdentifier = jest.fn().mockResolvedValue(new LnurlServerUnavailableError())
    mockLnurlServerService.mockReturnValue(lnurlServerService({ getIdentifier }))

    const result = await getAccountIdentifier(username)

    expect(result).toBeInstanceOf(LnurlServerUnavailableError)
  })
})
