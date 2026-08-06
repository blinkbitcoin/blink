import { MigrationOnHoldError } from "./errors"

export const evaluateDepositHold = ({
  volumeSats,
  thresholdSats,
}: {
  volumeSats: Satoshis
  thresholdSats: Satoshis
}): true | MigrationOnHoldError =>
  volumeSats > thresholdSats ? new MigrationOnHoldError() : true
