import MigrationLnAddressTransferStatus from "../scalar/migration-ln-address-transfer-status"

import { GT } from "@/graphql/index"

const MigrationLnAddressTransferResult = GT.Object<MigrationLnAddressTransferResult>({
  name: "MigrationLnAddressTransferResult",
  fields: () => ({
    identifier: {
      type: GT.NonNull(GT.String),
    },
    status: {
      type: GT.NonNull(MigrationLnAddressTransferStatus),
    },
    lightningAddress: {
      type: GT.String,
    },
  }),
})

export default MigrationLnAddressTransferResult
