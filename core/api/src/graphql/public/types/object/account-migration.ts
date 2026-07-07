import MigrationStatus from "../scalar/migration-status"

import { GT } from "@/graphql/index"

const AccountMigration = GT.Object<Pick<MigrationFlow, "phase" | "lnPaymentHash">>({
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
  }),
})

export default AccountMigration
