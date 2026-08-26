import {
  AccountValidator,
  PostMigrationAccountValidator,
} from "@/domain/accounts/account-validator"
import { InactiveAccountError, InvalidWalletId } from "@/domain/errors"
import { AccountStatus, AccountLevel } from "@/domain/accounts/primitives"
import { UsdDisplayCurrency } from "@/domain/fiat/primitives"
import { WalletType } from "@/domain/wallets/primitives"
import { WalletCurrency } from "@/domain/shared/primitives"

describe("AccountValidator", () => {
  const baseAccountProps = {
    createdAt: new Date(),
    defaultWalletId: "wallet-id-1" as WalletId,
    withdrawFee: 100 as Satoshis,
    level: AccountLevel.One,
    contactEnabled: true,
    contacts: [],
    kratosUserId: "kratos-id-1" as UserId,
    displayCurrency: UsdDisplayCurrency,
    statusHistory: [],
  }

  it("returns validator object for active account", () => {
    const validAccount = {
      ...baseAccountProps,
      id: "account-id-1" as AccountId,
      status: AccountStatus.Active,
    }

    const result = AccountValidator(validAccount)
    expect(result).not.toBeInstanceOf(Error)
    expect(result).toHaveProperty("validateWalletForAccount")
  })

  it("returns validator object for invited account", () => {
    const invitedAccount = {
      ...baseAccountProps,
      id: "account-id-2" as AccountId,
      status: AccountStatus.Invited,
    }

    const result = AccountValidator(invitedAccount)
    expect(result).not.toBeInstanceOf(Error)
    expect(result).toHaveProperty("validateWalletForAccount")
  })

  it("returns error for migrated account", () => {
    const migratedAccount = {
      ...baseAccountProps,
      id: "account-id-4" as AccountId,
      status: AccountStatus.Migrated,
    }

    const result = AccountValidator(migratedAccount)
    expect(result).toBeInstanceOf(InactiveAccountError)
    expect(result).toHaveProperty("message", "account-id-4")
  })

  it("returns error if account status is not active or invited", () => {
    const inactiveAccount = {
      ...baseAccountProps,
      id: "account-id-3" as AccountId,
      status: AccountStatus.Locked,
    }

    const result = AccountValidator(inactiveAccount)
    expect(result).toBeInstanceOf(InactiveAccountError)
    expect(result).toHaveProperty("message", "account-id-3")
  })

  it.each([AccountStatus.New, AccountStatus.Pending, AccountStatus.Closed])(
    "rejects %s status",
    (status) => {
      const account = { ...baseAccountProps, id: "account-id-5" as AccountId, status }
      expect(AccountValidator(account)).toBeInstanceOf(InactiveAccountError)
    },
  )

  it("returns true if wallet.accountId matches account.id", () => {
    const validAccount = {
      ...baseAccountProps,
      id: "account-id-1" as AccountId,
      status: AccountStatus.Active,
    }

    const validWallet = {
      id: "wallet-id-1" as WalletId,
      accountId: "account-id-1" as AccountId,
      currency: WalletCurrency.Btc,
      type: WalletType.Checking,
      onChainAddressIdentifiers: [],
      onChainAddresses: () => [],
    } as Wallet

    const validator = AccountValidator(validAccount)
    if (validator instanceof Error) throw validator

    const result = validator.validateWalletForAccount(validWallet)
    expect(result).toBe(true)
  })

  it("returns InvalidWalletId error if wallet.accountId does not match account.id", () => {
    const validAccount = {
      ...baseAccountProps,
      id: "account-id-1" as AccountId,
      status: AccountStatus.Active,
    }

    const invalidWallet = {
      id: "wallet-id-1" as WalletId,
      accountId: "wrong-account-id" as AccountId,
      currency: WalletCurrency.Btc,
      type: WalletType.Checking,
      onChainAddressIdentifiers: [],
      onChainAddresses: () => [],
    } as Wallet

    const validator = AccountValidator(validAccount)
    if (validator instanceof Error) throw validator

    const result = validator.validateWalletForAccount(invalidWallet)
    expect(result).toBeInstanceOf(InvalidWalletId)
    expect(result).toHaveProperty("message")
  })
})

describe("PostMigrationAccountValidator", () => {
  const account = (status: AccountStatus): Account =>
    ({
      id: "account-id" as AccountId,
      status,
    }) as Account
  const wallet = (accountId: AccountId): Wallet =>
    ({
      id: "wallet-id" as WalletId,
      accountId,
      currency: WalletCurrency.Btc,
      type: WalletType.Checking,
      onChainAddressIdentifiers: [],
      onChainAddresses: () => [],
    }) as Wallet

  it.each([AccountStatus.Migrated, AccountStatus.Closed])(
    "allows %s only for its own wallet",
    (status) => {
      const validator = PostMigrationAccountValidator(account(status))
      if (validator instanceof Error) throw validator

      expect(validator.validateWalletForAccount(wallet("account-id" as AccountId))).toBe(
        true,
      )
      expect(
        validator.validateWalletForAccount(wallet("another-account" as AccountId)),
      ).toBeInstanceOf(InvalidWalletId)
    },
  )

  it.each([
    AccountStatus.New,
    AccountStatus.Invited,
    AccountStatus.Pending,
    AccountStatus.Active,
    AccountStatus.Locked,
  ])("rejects %s", (status) => {
    expect(PostMigrationAccountValidator(account(status))).toBeInstanceOf(
      InactiveAccountError,
    )
  })
})
