jest.mock("@/config", () => ({
  getDefaultAccountsConfig: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  AccountsRepository: jest.fn(),
}))

import { setUsername } from "@/app/accounts/set-username"

import { getDefaultAccountsConfig } from "@/config"
import { UsernameSetupNotAllowedError } from "@/domain/accounts"
import { AccountsRepository } from "@/services/mongoose"

const mockGetDefaultAccountsConfig = getDefaultAccountsConfig as jest.MockedFunction<
  typeof getDefaultAccountsConfig
>
const mockAccountsRepository = AccountsRepository as jest.MockedFunction<
  typeof AccountsRepository
>

describe("Set username", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockGetDefaultAccountsConfig.mockReturnValue({
      initialStatus: "active" as AccountStatus,
      initialWallets: [] as WalletCurrency[],
      initialLevel: 1 as AccountLevel,
      maxDeletions: 2,
      allowUsernameSetup: false,
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
