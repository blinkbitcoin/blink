/**
 * Assisted fund release: move an orphaned account's full balance to an
 * account the customer controls, then close the orphaned account. One step per invocation
 * so each can be run, checked and recorded on its own.
 *
 * how to run:
 *
 * pnpm tsx src/debug/assisted-fund-release.ts inspect   <senderAccountId> <recipientAccountId>
 * pnpm tsx src/debug/assisted-fund-release.ts set-level <senderAccountId> <0|1|2|3>
 * pnpm tsx src/debug/assisted-fund-release.ts transfer  <senderAccountId> <recipientAccountId> <BTC|USD> <memo>
 * pnpm tsx src/debug/assisted-fund-release.ts close     <senderAccountId> [updatedBy]
 *
 * inspect    read-only. Prints both accounts, every wallet with its live balance, the sender's
 *            level + configured/remaining intraledger limit vs what a full transfer would need,
 *            and the recipient's receive check. Run it before and after every other step.
 * set-level  changes the sender's account level. Needed when the sender is Level 0: its
 *            intraledger daily limit is usually below an assisted-release balance.
 * transfer   sends the sender wallet's FULL current balance in <currency> to the recipient's
 *            wallet of the same currency through the standard intraledger path (limits, wallet
 *            locks, notifications and memo sharing all apply). Run once per currency.
 * close      marks the sender account for deletion (status Closed, username released, Kratos
 *            identity deleted). Refuses if any sender wallet still has a balance. updatedBy
 *            defaults to "admin"; step names are rejected as likely mistyped commands.
 */

import { Accounts, Payments } from "@/app"
import { getMidPriceRatio } from "@/app/prices"
import { getBalanceForWallet, listWalletsByAccountId } from "@/app/wallets"
import { checkReceiveAllowed } from "@/app/wind-down"

import { getAccountLimits, getDealerConfig } from "@/config"

import {
  AccountValidator,
  checkedToAccountId,
  checkedToAccountLevel,
} from "@/domain/accounts"
import { WalletCurrency, paymentAmountFromNumber } from "@/domain/shared"

import { setupMongoConnection } from "@/services/mongodb"
import { AccountsRepository } from "@/services/mongoose"

export const steps = ["inspect", "set-level", "transfer", "close"] as const
type Step = (typeof steps)[number]

const usage = `usage:
  inspect   <senderAccountId> <recipientAccountId>
  set-level <senderAccountId> <0|1|2|3>
  transfer  <senderAccountId> <recipientAccountId> <BTC|USD> <memo>
  close     <senderAccountId> [updatedBy]`

const findAccount = async (raw: string | undefined, label: string) => {
  if (!raw) return new Error(`Missing ${label} account id`)
  const accountId = checkedToAccountId(raw)
  if (accountId instanceof Error) return accountId
  const account = await AccountsRepository().findById(accountId)
  if (account instanceof Error) return new Error(`${label} ${raw}: ${account.name}`)
  return account
}

const walletFor = async (account: Account, currency: WalletCurrency) => {
  const wallets = await listWalletsByAccountId(account.id)
  if (wallets instanceof Error) return wallets
  return (
    wallets.find((wallet) => wallet.currency === currency) ??
    new Error(`Account ${account.id} has no ${currency} wallet`)
  )
}

export const parseCurrency = (raw: string | undefined) => {
  if (raw === WalletCurrency.Btc || raw === WalletCurrency.Usd) return raw
  return new Error(`Invalid currency: ${raw}. Expected BTC or USD`)
}

const describeAccount = async (label: string, account: Account) => {
  const validator = AccountValidator(account)
  console.log(`\n[${label}] ${account.id}`)
  console.log(`  username:        ${account.username ?? "-"}`)
  console.log(`  level / status:  ${account.level} / ${account.status}`)
  console.log(`  kratosUserId:    ${account.kratosUserId}`)
  console.log(`  defaultWalletId: ${account.defaultWalletId}`)
  console.log(`  validator:       ${validator instanceof Error ? validator.name : "ok"}`)

  const wallets = await listWalletsByAccountId(account.id)
  if (wallets instanceof Error) return wallets

  const balances: { currency: WalletCurrency; balance: number }[] = []
  for (const wallet of wallets) {
    const balance = await getBalanceForWallet({ walletId: wallet.id })
    if (balance instanceof Error) return balance
    balances.push({ currency: wallet.currency, balance })
    console.log(`  wallet ${wallet.currency}: ${wallet.id}  balance=${balance}`)
  }
  return balances
}

export const inspect = async (args: string[]) => {
  const sender = await findAccount(args[0], "sender")
  if (sender instanceof Error) return sender
  const recipient = await findAccount(args[1], "recipient")
  if (recipient instanceof Error) return recipient
  if (sender.id === recipient.id)
    return new Error("sender and recipient are the same account")

  const senderBalances = await describeAccount("sender", sender)
  if (senderBalances instanceof Error) return senderBalances
  const recipientBalances = await describeAccount("recipient", recipient)
  if (recipientBalances instanceof Error) return recipientBalances

  for (const { currency, balance } of senderBalances) {
    if (balance <= 0) continue
    const target = recipientBalances.find((b) => b.currency === currency)
    console.log(
      `\n  ${currency}: ${balance} to move -> recipient ${currency} wallet ${target ? "present" : "MISSING"}`,
    )
  }

  const priceRatio = await getMidPriceRatio(getDealerConfig().usd.hedgingEnabled)
  if (priceRatio instanceof Error) return priceRatio

  let neededCents = 0n
  for (const { currency, balance } of senderBalances) {
    if (balance <= 0) continue
    if (currency === WalletCurrency.Usd) {
      neededCents += BigInt(balance)
      continue
    }
    const btc = paymentAmountFromNumber({ amount: balance, currency: WalletCurrency.Btc })
    if (btc instanceof Error) return btc
    neededCents += priceRatio.convertFromBtc(btc).amount
  }

  const { intraLedgerLimit } = getAccountLimits({ level: sender.level })
  const remaining = await Accounts.remainingIntraLedgerLimit({
    accountId: sender.id,
    priceRatio,
  })

  console.log(`\n[sender intraledger limit] (values from the config this process loaded)`)
  console.log(`  level ${sender.level} daily limit: ${intraLedgerLimit} cents`)
  console.log(`  full transfer needs:        ~${neededCents} cents (mid price)`)
  if (remaining instanceof Error) {
    console.log(`  remaining today:             ${remaining.name} (${remaining.message})`)
    console.log(
      `  => the send path runs this same check; the transfer will fail until fixed`,
    )
  } else {
    console.log(`  remaining today:             ${remaining.amount} cents`)
    if (neededCents > remaining.amount) {
      console.log(
        `  => WILL EXCEED LIMIT. Raise the level (set-level) or split across days.`,
      )
    }
  }

  const receive = await checkReceiveAllowed({ account: recipient })
  console.log(
    `\n[recipient receive check] ${receive instanceof Error ? receive.name : "ok"}`,
  )

  return true
}

export const setLevel = async (args: string[]) => {
  const sender = await findAccount(args[0], "sender")
  if (sender instanceof Error) return sender

  const level = checkedToAccountLevel(Number(args[1]))
  if (level instanceof Error) return level

  const updated = await Accounts.updateAccountLevel({ accountId: sender.id, level })
  if (updated instanceof Error) return updated

  console.log(`Account ${sender.id} level ${sender.level} -> ${updated.level}`)
  return true
}

export const transfer = async (args: string[]) => {
  const sender = await findAccount(args[0], "sender")
  if (sender instanceof Error) return sender
  const recipient = await findAccount(args[1], "recipient")
  if (recipient instanceof Error) return recipient
  if (sender.id === recipient.id)
    return new Error("sender and recipient are the same account")

  const currency = parseCurrency(args[2])
  if (currency instanceof Error) return currency

  const memo = args.slice(3).join(" ").trim()
  if (!memo) return new Error("Missing memo")

  const senderWallet = await walletFor(sender, currency)
  if (senderWallet instanceof Error) return senderWallet
  const recipientWallet = await walletFor(recipient, currency)
  if (recipientWallet instanceof Error) return recipientWallet

  const balance = await getBalanceForWallet({ walletId: senderWallet.id })
  if (balance instanceof Error) return balance
  if (balance <= 0) {
    console.log(
      `Sender ${currency} wallet ${senderWallet.id} balance is ${balance}; nothing to send`,
    )
    return true
  }

  console.log(
    `Sending ${balance} ${currency === WalletCurrency.Btc ? "sats" : "cents"} ` +
      `from ${senderWallet.id} (${sender.username ?? sender.id}) ` +
      `to ${recipientWallet.id} (${recipient.username ?? recipient.id}) memo="${memo}"`,
  )

  const send =
    currency === WalletCurrency.Btc
      ? Payments.intraledgerPaymentSendWalletIdForBtcWallet
      : Payments.intraledgerPaymentSendWalletIdForUsdWallet

  const result = await send({
    senderWalletId: senderWallet.id,
    senderAccount: sender,
    recipientWalletId: recipientWallet.id,
    amount: balance,
    memo,
  })
  if (result instanceof Error) return result

  const after = await getBalanceForWallet({ walletId: senderWallet.id })
  console.log(
    `Result: status=${result.status.value} transactionId=${result.transaction.id}`,
  )
  console.log(
    `Sender ${currency} wallet balance now: ${after instanceof Error ? after.name : after}`,
  )
  return true
}

export const parseUpdatedBy = (raw: string | undefined): PrivilegedClientId | Error => {
  if (!raw) return "admin" as PrivilegedClientId
  if (steps.includes(raw as Step)) {
    return new Error(
      `updatedBy "${raw}" is a step name - likely a mistyped command. Pass an operator/case reference or omit it for "admin"`,
    )
  }
  return raw as PrivilegedClientId
}

export const close = async (args: string[]) => {
  const updatedBy = parseUpdatedBy(args[1])
  if (updatedBy instanceof Error) return updatedBy

  const sender = await findAccount(args[0], "sender")
  if (sender instanceof Error) return sender

  const balances = await describeAccount("closing", sender)
  if (balances instanceof Error) return balances

  const result = await Accounts.markAccountForDeletion({
    accountId: sender.id,
    cancelIfPositiveBalance: true,
    bypassMaxDeletions: true,
    updatedByPrivilegedClientId: updatedBy,
  })
  if (result instanceof Error) return result

  const closed = await AccountsRepository().findById(sender.id)
  console.log(
    `Account ${sender.id} closed (updatedBy=${updatedBy}); status now: ${
      closed instanceof Error ? closed.name : closed.status
    }`,
  )
  return true
}

const main = async () => {
  const [stepRaw, ...args] = process.argv.slice(2)
  if (!steps.includes(stepRaw as Step)) {
    console.error(`Unknown step: ${stepRaw}\n${usage}`)
    process.exitCode = 1
    return
  }

  const runners: Record<Step, (args: string[]) => Promise<true | Error>> = {
    inspect,
    "set-level": setLevel,
    transfer,
    close,
  }

  const result = await runners[stepRaw as Step](args)
  if (result instanceof Error) {
    console.error("Error:", result)
    process.exitCode = 1
  }
}

if (require.main === module) {
  setupMongoConnection()
    .then(async (mongoose) => {
      await main()
      if (mongoose) await mongoose.connection.close()
    })
    .catch((err) => console.log(err))
}
