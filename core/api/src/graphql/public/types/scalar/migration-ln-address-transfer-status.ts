import { MigrationLnAddressTransferStatus as DomainStatus } from "@/domain/migration-flow"
import { GT } from "@/graphql/index"

const MigrationLnAddressTransferStatus = GT.Enum({
  name: "MigrationLnAddressTransferStatus",
  values: {
    TRANSFERRED: { value: DomainStatus.Transferred },
    ALREADY_TRANSFERRED: { value: DomainStatus.AlreadyTransferred },
    SKIPPED_NOT_REGISTERED: { value: DomainStatus.SkippedNotRegistered },
    FAILED: { value: DomainStatus.Failed },
  },
})

export default MigrationLnAddressTransferStatus
