import AccountMigration from "../object/account-migration"

import IError from "@/graphql/shared/types/abstract/error"
import { GT } from "@/graphql/index"

const MigrationPayload = GT.Object({
  name: "MigrationPayload",
  fields: () => ({
    errors: {
      type: GT.NonNullList(IError),
    },
    migration: {
      type: AccountMigration,
    },
  }),
})

export default MigrationPayload
