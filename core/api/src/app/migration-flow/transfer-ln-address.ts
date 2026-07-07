import { LNURL_SERVER_LN_ADDRESS_DOMAIN } from "@/config"

import { getLnurlServerService } from "@/app/accounts/lnurl-server"

import { ErrorLevel } from "@/domain/shared"

import { MigrationFlowStateRepository } from "@/services/mongoose"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

export const transferLnAddressToSpark = async ({
  account,
  destinationSparkPubkey,
}: {
  account: Account
  destinationSparkPubkey: SparkPubkey
}): Promise<void> => {
  const recordStep = async (detail: string) => {
    const recorded = await MigrationFlowStateRepository().addStep({
      accountId: account.id,
      step: { step: "ln-address-transfer", detail },
    })
    if (recorded instanceof Error) {
      recordExceptionInCurrentSpan({ error: recorded, level: ErrorLevel.Warn })
    }
  }

  try {
    if (!account.username) {
      await recordStep("skipped: no username")
      return
    }

    const lnurlServer = getLnurlServerService()
    if (lnurlServer === null) {
      await recordStep("skipped: lnurl server not configured")
      return
    }

    const result = await lnurlServer.transferIdentifierToSpark({
      domain: LNURL_SERVER_LN_ADDRESS_DOMAIN,
      identifier: account.username,
      destinationSparkPubkey,
      description: `Payment to ${account.username}`,
    })
    if (result instanceof Error) {
      recordExceptionInCurrentSpan({ error: result, level: ErrorLevel.Warn })
      await recordStep(`failed: ${result.name}`)
      return
    }

    await recordStep(`transferred: ${result.lightningAddress}`)
  } catch (err) {
    recordExceptionInCurrentSpan({ error: err, level: ErrorLevel.Warn })
    await recordStep(`failed: ${err instanceof Error ? err.name : "unknown error"}`)
  }
}
