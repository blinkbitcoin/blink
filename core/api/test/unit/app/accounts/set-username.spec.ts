jest.mock("@/config", () => ({
  getAccountsOnboardConfig: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  AccountsRepository: jest.fn(),
}))

import { setUsername } from "@/app/accounts/set-username"

import { getAccountsOnboardConfig } from "@/config"
import { UsernameSetupNotAllowedError } from "@/domain/accounts"
import { AccountsRepository } from "@/services/mongoose"

const mockGetAccountsOnboardConfig = getAccountsOnboardConfig as jest.MockedFunction<
  typeof getAccountsOnboardConfig
>
const mockAccountsRepository = AccountsRepository as jest.MockedFunction<
  typeof AccountsRepository
>

describe("Set username", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockGetAccountsOnboardConfig.mockReturnValue({
      allowUsernameSetup: false,
      phoneMetadataValidationSettings: {
        enabled: false,
        denyCountries: [],
        allowCountries: [],
      },
      ipMetadataValidationSettings: {
        enabled: false,
        denyCountries: [],
        allowCountries: [],
        denyASNs: [],
        allowASNs: [],
        checkProxy: false,
      },
    })
  })

  it("fails when username setup is disabled", async () => {
    const result = await setUsername({
      accountId: crypto.randomUUID(),
      username: "alice",
    })

    expect(result).toBeInstanceOf(UsernameSetupNotAllowedError)
    expect(mockAccountsRepository).not.toHaveBeenCalled()
  })
})
