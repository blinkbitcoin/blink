/**
 * Bind an email login credential to a device-only Kratos identity.
 *
 * Dry run:
 * pnpm tsx src/debug/bind-email-to-device-account.ts <kratos-user-id> <email>
 *
 * Execute:
 * pnpm tsx src/debug/bind-email-to-device-account.ts <kratos-user-id> <email> --execute
 */

import { JsonPatch, UpdateIdentityBody } from "@ory/client"

import { KRATOS_MASTER_USER_PASSWORD } from "@/config"
import { UuidRegex } from "@/domain/shared"
import { checkedToEmailAddress } from "@/domain/users"
import { kratosAdmin, toDomainIdentity } from "@/services/kratos/private"
import { SchemaIdType } from "@/services/kratos/schema"

const expectedArgs = "<kratos-user-id> <email> [--execute]"

const parseArgs = () => {
  const execute = process.argv.includes("--execute")
  const positionalArgs = process.argv.slice(2).filter((arg) => arg !== "--execute")
  const [rawUserId, rawEmail] = positionalArgs

  if (!rawUserId || !rawEmail || positionalArgs.length !== 2) {
    return new Error(
      `Usage: pnpm tsx src/debug/bind-email-to-device-account.ts ${expectedArgs}`,
    )
  }

  if (!UuidRegex.test(rawUserId)) {
    return new Error(`Invalid Kratos user ID: ${rawUserId}`)
  }

  const email = checkedToEmailAddress(rawEmail)
  if (email instanceof Error) return email

  return {
    email,
    execute,
    userId: rawUserId as UserId,
  }
}

const assertEmailIsAvailable = async (email: EmailAddress) => {
  const { data: identities } = await kratosAdmin.listIdentities({
    credentialsIdentifier: email,
  })

  if (identities.length > 0) {
    return new Error(`Email is already bound to Kratos identity ${identities[0].id}`)
  }

  return true
}

const bindEmailToDeviceAccount = async ({
  email,
  execute,
  userId,
}: {
  email: EmailAddress
  execute: boolean
  userId: UserId
}) => {
  const { data: identity } = await kratosAdmin.getIdentity({ id: userId })

  if (identity.schema_id !== SchemaIdType.UsernamePasswordDeviceIdV0) {
    return new Error(
      `Identity ${userId} has schema ${identity.schema_id}; expected ${SchemaIdType.UsernamePasswordDeviceIdV0}`,
    )
  }

  if (identity.traits.email || identity.traits.phone) {
    return new Error(`Identity ${userId} already has a phone or email trait`)
  }

  if (identity.state === undefined) {
    return new Error(`Identity ${userId} has no state`)
  }

  const availability = await assertEmailIsAvailable(email)
  if (availability instanceof Error) return availability

  const updateIdentityBody: UpdateIdentityBody = {
    ...identity,
    credentials: {
      ...(identity.credentials || {}),
      password: { config: { password: KRATOS_MASTER_USER_PASSWORD } },
    },
    schema_id: SchemaIdType.EmailNoPasswordV0,
    state: identity.state,
    traits: { email },
  }

  console.log("Prepared Kratos identity update", {
    dryRun: !execute,
    fromSchema: identity.schema_id,
    toSchema: updateIdentityBody.schema_id,
    userId,
  })

  if (!execute) {
    console.log("Dry run only. Re-run with --execute to apply.")
    return true
  }

  const { data: updatedIdentity } = await kratosAdmin.updateIdentity({
    id: userId,
    updateIdentityBody,
  })

  const patchOperations: JsonPatch[] = []
  const emailAddressIndex = updatedIdentity.verifiable_addresses?.findIndex(
    (address) => address.via === "email" && address.value === email,
  )

  if (emailAddressIndex !== undefined && emailAddressIndex >= 0) {
    patchOperations.push(
      {
        op: "replace",
        path: `/verifiable_addresses/${emailAddressIndex}/verified`,
        value: true,
      },
      {
        op: "replace",
        path: `/verifiable_addresses/${emailAddressIndex}/verified_at`,
        value: new Date().toISOString(),
      },
      {
        op: "replace",
        path: `/verifiable_addresses/${emailAddressIndex}/status`,
        value: "completed",
      },
    )
  }

  const finalIdentity =
    patchOperations.length > 0
      ? (
          await kratosAdmin.patchIdentity({
            id: userId,
            jsonPatch: patchOperations,
          })
        ).data
      : updatedIdentity

  console.log("Successfully bound email credential", {
    emailVerified: toDomainIdentity(finalIdentity).emailVerified,
    schema: finalIdentity.schema_id,
    userId,
  })

  return true
}

const main = async () => {
  const args = parseArgs()
  if (args instanceof Error) {
    console.error(args.message)
    process.exitCode = 1
    return
  }

  const result = await bindEmailToDeviceAccount(args)
  if (result instanceof Error) {
    console.error(result.message)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
