import { close, inspect, setLevel, transfer } from "@/debug/assisted-fund-release"

import { getBalanceForWallet } from "@/app/wallets"

import { AccountStatus } from "@/domain/accounts"
import { AccountHasPositiveBalanceError } from "@/domain/authentication/errors"
import { IntraledgerLimitsExceededError } from "@/domain/errors"
import { UsdDisplayCurrency } from "@/domain/fiat"
import { WalletCurrency } from "@/domain/shared"

import { createAccountWithPhoneIdentifier } from "@/app/accounts"
import { getDefaultAccountsConfig } from "@/config"
import { AuthWithPhonePasswordlessService } from "@/services/kratos"
import {
  AccountsRepository,
  UsersRepository,
  WalletsRepository,
} from "@/services/mongoose"
import { Transaction } from "@/services/ledger/schema"

import {
  createMandatoryUsers,
  createRandomUserAndWallets,
  randomPhone,
  recordReceiveLnPayment,
} from "test/helpers"

// The shared helpers fabricate kratosUserId, but close() ends in a real Kratos
// identity deletion - the sender needs an identity Kratos actually knows.
const createRandomUserWithRealIdentity = async () => {
  const phone = randomPhone()
  const kratosResult = await AuthWithPhonePasswordlessService().createIdentityWithSession(
    { phone },
  )
  if (kratosResult instanceof Error) throw kratosResult
  const { kratosUserId } = kratosResult

  const user = await UsersRepository().update({ id: kratosUserId, phone })
  if (user instanceof Error) throw user

  const account = await createAccountWithPhoneIdentifier({
    newAccountInfo: { phone, kratosUserId },
    config: getDefaultAccountsConfig(),
  })
  if (account instanceof Error) throw account

  const wallets = await WalletsRepository().findAccountWalletsByAccountId(account.id)
  if (wallets instanceof Error) throw wallets

  return {
    accountId: account.id,
    btcWalletDescriptor: wallets.BTC,
    usdWalletDescriptor: wallets.USD,
  }
}

// The test price mock values BTC at 0.05 cents/sat, so the default Level 0
// intraledger limit (12,500 cents) is crossed at 250,000 sats.
const btcFundingAmount = { amount: 300_000n, currency: WalletCurrency.Btc }
const btcFundingAmountUsd = { amount: 15_000n, currency: WalletCurrency.Usd }
const usdFundingAmount = { amount: 500n, currency: WalletCurrency.Usd }
const usdFundingAmountBtc = { amount: 10_000n, currency: WalletCurrency.Btc }
const zeroBankFee = {
  btc: { amount: 0n, currency: WalletCurrency.Btc },
  usd: { amount: 0n, currency: WalletCurrency.Usd },
}
const memo = "assisted-fund-release-spec"

const displayAmounts = (usdAmount: bigint) => ({
  amountDisplayCurrency: Number(usdAmount) as DisplayCurrencyBaseAmount,
  feeDisplayCurrency: 0 as DisplayCurrencyBaseAmount,
  displayCurrency: UsdDisplayCurrency,
})

const balanceOf = async (walletId: WalletId) => {
  const balance = await getBalanceForWallet({ walletId })
  if (balance instanceof Error) throw balance
  return balance
}

const accountById = async (accountId: AccountId) => {
  const account = await AccountsRepository().findById(accountId)
  if (account instanceof Error) throw account
  return account
}

let senderBtcWallet: WalletDescriptor<"BTC">
let senderUsdWallet: WalletDescriptor<"USD">
let recipientBtcWallet: WalletDescriptor<"BTC">
let recipientUsdWallet: WalletDescriptor<"USD">
let senderAccountId: AccountId
let recipientAccountId: AccountId

beforeAll(async () => {
  await createMandatoryUsers()

  jest.spyOn(console, "log").mockImplementation(() => undefined)

  const sender = await createRandomUserWithRealIdentity()
  senderBtcWallet = sender.btcWalletDescriptor
  senderUsdWallet = sender.usdWalletDescriptor
  senderAccountId = sender.accountId

  const recipient = await createRandomUserAndWallets()
  recipientBtcWallet = recipient.btcWalletDescriptor
  recipientUsdWallet = recipient.usdWalletDescriptor
  recipientAccountId = recipient.btcWalletDescriptor.accountId

  const btcReceive = await recordReceiveLnPayment({
    walletDescriptor: senderBtcWallet,
    paymentAmount: { btc: btcFundingAmount, usd: btcFundingAmountUsd },
    bankFee: zeroBankFee,
    displayAmounts: displayAmounts(btcFundingAmountUsd.amount),
    memo,
  })
  if (btcReceive instanceof Error) throw btcReceive

  const usdReceive = await recordReceiveLnPayment({
    walletDescriptor: senderUsdWallet,
    paymentAmount: { btc: usdFundingAmountBtc, usd: usdFundingAmount },
    bankFee: zeroBankFee,
    displayAmounts: displayAmounts(usdFundingAmount.amount),
    memo,
  })
  if (usdReceive instanceof Error) throw usdReceive
})

afterAll(() => {
  jest.restoreAllMocks()
})

describe("assisted-fund-release steps", () => {
  // Cleanup once at the end: balances are computed from the ledger journal, so
  // deleting rows between tests would resurrect already-transferred balances.
  afterAll(async () => {
    await Transaction.deleteMany({ memo })
    await Transaction.deleteMany({ memoPayer: memo })
  })

  it("inspect runs read-only against both accounts", async () => {
    const senderBtcBefore = await balanceOf(senderBtcWallet.id)

    const result = await inspect([senderAccountId, recipientAccountId])

    expect(result).toBe(true)
    expect(await balanceOf(senderBtcWallet.id)).toEqual(senderBtcBefore)
  })

  it("inspect refuses a self-transfer", async () => {
    const result = await inspect([senderAccountId, senderAccountId])
    expect(result).toBeInstanceOf(Error)
  })

  it("set-level moves the sender to Level 0", async () => {
    const result = await setLevel([senderAccountId, "0"])
    expect(result).toBe(true)
    expect((await accountById(senderAccountId)).level).toEqual(0)
  })

  it("transfer refuses a Level 0 sender above the daily intraledger limit", async () => {
    const senderBtcBefore = await balanceOf(senderBtcWallet.id)

    const result = await transfer([senderAccountId, recipientAccountId, "BTC", memo])

    expect(result).toBeInstanceOf(IntraledgerLimitsExceededError)
    expect(await balanceOf(senderBtcWallet.id)).toEqual(senderBtcBefore)
    expect(await balanceOf(recipientBtcWallet.id)).toEqual(0)
  })

  it("transfer drains both wallets exactly after a level raise", async () => {
    const raised = await setLevel([senderAccountId, "1"])
    expect(raised).toBe(true)

    const senderBtcBefore = await balanceOf(senderBtcWallet.id)
    const senderUsdBefore = await balanceOf(senderUsdWallet.id)
    expect(senderBtcBefore).toBeGreaterThan(0)
    expect(senderUsdBefore).toBeGreaterThan(0)

    const btcResult = await transfer([senderAccountId, recipientAccountId, "BTC", memo])
    expect(btcResult).toBe(true)

    const usdResult = await transfer([senderAccountId, recipientAccountId, "USD", memo])
    expect(usdResult).toBe(true)

    expect(await balanceOf(senderBtcWallet.id)).toEqual(0)
    expect(await balanceOf(senderUsdWallet.id)).toEqual(0)
    expect(await balanceOf(recipientBtcWallet.id)).toEqual(senderBtcBefore)
    expect(await balanceOf(recipientUsdWallet.id)).toEqual(senderUsdBefore)
  })

  it("transfer is a no-op on an empty wallet", async () => {
    const recipientBtcBefore = await balanceOf(recipientBtcWallet.id)

    const result = await transfer([senderAccountId, recipientAccountId, "BTC", memo])

    expect(result).toBe(true)
    expect(await balanceOf(recipientBtcWallet.id)).toEqual(recipientBtcBefore)
  })

  it("close rejects a step name as updatedBy before touching the account", async () => {
    const result = await close([senderAccountId, "close"])

    expect(result).toBeInstanceOf(Error)
    expect((await accountById(senderAccountId)).status).toEqual(AccountStatus.Active)
  })

  it("close refuses while a wallet still has a balance", async () => {
    const result = await close([recipientAccountId, "test/spec"])

    expect(result).toBeInstanceOf(AccountHasPositiveBalanceError)
    expect((await accountById(recipientAccountId)).status).toEqual(AccountStatus.Active)
  })

  it("close marks the drained account closed and records updatedBy", async () => {
    const result = await close([senderAccountId, "test/spec"])
    expect(result).toBe(true)

    const account = await accountById(senderAccountId)
    expect(account.status).toEqual(AccountStatus.Closed)
    expect(account.statusHistory.slice(-1)[0]).toMatchObject({
      status: AccountStatus.Closed,
      updatedByPrivilegedClientId: "test/spec",
    })
  })
})
