/**
 * how to run:
 *
 * pnpm tsx src/debug/upgrade-device-account.ts <account id> <phone>
 *
 * <account id>: ID of the device account to upgrade to level 1
 * <phone>: Phone number to associate with the account (e.g. +15555550100)
 */

import { upgradeAccountFromDeviceToPhone } from "@/app/accounts"
import { getPhoneMetadata } from "@/app/authentication/get-phone-metadata"

import { AccountLevel } from "@/domain/accounts"
import { PhoneAlreadyExistsError } from "@/domain/authentication/errors"
import { InvalidAccountLevelError } from "@/domain/errors"

import {
  AuthWithUsernamePasswordDeviceIdService,
  IdentityRepository,
} from "@/services/kratos"
import { AccountsRepository } from "@/services/mongoose"
import { setupMongoConnection } from "@/services/mongodb"

const upgradeDeviceAccount = async ({
  accountId,
  phone,
}: {
  accountId: AccountId
  phone: PhoneNumber
}) => {
  const account = await AccountsRepository().findById(accountId)
  if (account instanceof Error) return account

  if (account.level !== AccountLevel.Zero) return new InvalidAccountLevelError()

  const identities = IdentityRepository()
  const userId = await identities.getUserIdFromIdentifier(phone)
  if (!(userId instanceof Error)) {
    return new PhoneAlreadyExistsError()
  }

  const phoneMetadata = await getPhoneMetadata({ phone })
  if (phoneMetadata instanceof Error) return phoneMetadata

  const upgraded = await AuthWithUsernamePasswordDeviceIdService().upgradeToPhoneSchema({
    phone,
    userId: account.kratosUserId,
  })
  if (upgraded instanceof Error) return upgraded

  const result = await upgradeAccountFromDeviceToPhone({
    userId: account.kratosUserId,
    phone,
    phoneMetadata,
  })
  if (result instanceof Error) return result

  return true
}

const main = async () => {
  const args = process.argv.slice(-2)
  const params = {
    accountId: args[0] as AccountId,
    phone: args[1] as PhoneNumber,
  }
  const result = await upgradeDeviceAccount(params)
  if (result instanceof Error) {
    console.error("Error:", result)
    return
  }
  console.log(
    `Successfully upgraded account ${params.accountId} to level 1 with phone ${params.phone}`,
  )
}

setupMongoConnection()
  .then(async (mongoose) => {
    await main()
    if (mongoose) await mongoose.connection.close()
  })
  .catch((err) => console.log(err))
