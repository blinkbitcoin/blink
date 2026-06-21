jest.mock("@/config", () => ({
  LNURL_SERVER_LN_ADDRESS_DOMAIN: "wallet.blink.test",
}))

jest.mock("@/services/mongoose", () => ({
  AccountsRepository: jest.fn(),
}))

jest.mock("@/services/lnurl-server", () => ({
  LnurlServerService: jest.fn(),
}))

import { usernameAvailable } from "@/app/accounts/username-available"

import {
  LnurlServerMissingInternalUrlError,
  LnurlServerNotFoundError,
  LnurlServerUnavailableError,
} from "@/domain/lnurl-server"
import { CouldNotFindError } from "@/domain/errors"
import { LnurlServerService } from "@/services/lnurl-server"
import { AccountsRepository } from "@/services/mongoose"

const mockLnurlServerService = LnurlServerService as jest.MockedFunction<
  typeof LnurlServerService
>
const mockAccountsRepository = AccountsRepository as jest.MockedFunction<
  typeof AccountsRepository
>

const lnurlServerService = (getIdentifier: jest.Mock): ILnurlServerService =>
  ({
    createBlinkAccount: jest.fn(),
    updateDefaultWallet: jest.fn(),
    getIdentifier,
    transferIdentifierToSpark: jest.fn(),
  }) as unknown as ILnurlServerService

describe("usernameAvailable", () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it("keeps current local behavior when lnurl internal url is missing", async () => {
    mockLnurlServerService.mockReturnValue(
      new LnurlServerMissingInternalUrlError("missing"),
    )
    mockAccountsRepository.mockReturnValue({
      findByUsername: jest.fn().mockResolvedValue(new CouldNotFindError()),
    } as unknown as ReturnType<typeof AccountsRepository>)

    const result = await usernameAvailable("alice" as Username)

    expect(result).toBe(true)
  })

  it("checks lnurl availability before local mongo", async () => {
    const getIdentifier = jest
      .fn()
      .mockResolvedValue(new LnurlServerNotFoundError("not_found"))
    const findByUsername = jest.fn().mockResolvedValue(new CouldNotFindError())

    mockLnurlServerService.mockReturnValue(lnurlServerService(getIdentifier))
    mockAccountsRepository.mockReturnValue({
      findByUsername,
    } as unknown as ReturnType<typeof AccountsRepository>)

    const result = await usernameAvailable("alice" as Username)

    expect(result).toBe(true)
    expect(getIdentifier).toHaveBeenCalledWith({
      domain: "wallet.blink.test",
      identifier: "alice",
    })
    expect(findByUsername.mock.invocationCallOrder[0]).toBeGreaterThan(
      getIdentifier.mock.invocationCallOrder[0],
    )
  })

  it("returns false when lnurl already has the identifier", async () => {
    mockLnurlServerService.mockReturnValue(
      lnurlServerService(jest.fn().mockResolvedValue({ identifier: "alice" })),
    )

    const result = await usernameAvailable("alice" as Username)

    expect(result).toBe(false)
    expect(mockAccountsRepository).not.toHaveBeenCalled()
  })

  it("returns lnurl errors other than not found", async () => {
    const lnurlError = new LnurlServerUnavailableError("provider_disabled")
    mockLnurlServerService.mockReturnValue(
      lnurlServerService(jest.fn().mockResolvedValue(lnurlError)),
    )

    const result = await usernameAvailable("alice" as Username)

    expect(result).toBe(lnurlError)
  })
})
