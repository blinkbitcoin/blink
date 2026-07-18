import MigrationStatus from "../scalar/migration-status"

import AccountMigrationPreview from "./account-migration-preview"

import { MigrationFlow as MigrationFlowApp } from "@/app"

import { mapError } from "@/graphql/error-map"
import { GT } from "@/graphql/index"

const AccountMigration = GT.Object<
  Pick<MigrationFlow, "phase" | "lnPaymentHash" | "accountId">
>({
  name: "AccountMigration",
  fields: () => ({
    status: {
      type: GT.NonNull(MigrationStatus),
      resolve: (source) => source.phase,
    },
    transferPaymentHash: {
      type: GT.String,
      resolve: (source) => source.lnPaymentHash ?? null,
    },
    preview: {
      type: GT.NonNull(AccountMigrationPreview),
      resolve: async (source) => {
        const result = await MigrationFlowApp.getMigrationPreview({
          accountId: source.accountId,
        })
        if (result instanceof Error) {
          throw mapError(result)
        }
        return result
      },
    },
  }),
})

export default AccountMigration
