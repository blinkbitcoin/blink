import MigrationLnAddressTransferResult from "../object/migration-ln-address-transfer-result"

import IError from "@/graphql/shared/types/abstract/error"
import { GT } from "@/graphql/index"

const MigrationLnAddressTransferPayload = GT.Object({
  name: "MigrationLnAddressTransferPayload",
  fields: () => ({
    errors: {
      type: GT.NonNullList(IError),
    },
    results: {
      type: GT.NonNullList(MigrationLnAddressTransferResult),
    },
  }),
})

export default MigrationLnAddressTransferPayload
