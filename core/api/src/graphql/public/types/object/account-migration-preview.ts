import SatAmount from "@/graphql/shared/types/scalar/sat-amount"
import { GT } from "@/graphql/index"

const AccountMigrationPreview = GT.Object<MigrationPreview>({
  name: "AccountMigrationPreview",
  fields: () => ({
    balanceSats: {
      type: GT.NonNull(SatAmount),
    },
    feeSats: {
      type: GT.NonNull(SatAmount),
    },
    feeCoveredByBlink: {
      type: GT.NonNull(GT.Boolean),
    },
    receiveSats: {
      type: GT.NonNull(SatAmount),
    },
  }),
})

export default AccountMigrationPreview
