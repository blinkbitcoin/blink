import { createHash } from "crypto"

import * as ecc from "tiny-secp256k1"

import { MigrationInvalidDestinationError, MigrationProofExpiredError } from "./errors"

export const MIGRATION_PROOF_FRESHNESS_WINDOW_MS = (5 * 60 * 1000) as MilliSeconds

const sha256 = (buffer: Buffer) => createHash("sha256").update(buffer).digest()

export const checkedToSparkPubkey = (
  pubkey: string,
): SparkPubkey | MigrationInvalidDestinationError => {
  if (!/^([0-9a-f]{64}|[0-9a-f]{66})$/i.test(pubkey)) {
    return new MigrationInvalidDestinationError(pubkey)
  }

  const bytes = Buffer.from(pubkey, "hex")
  try {
    if (bytes.length === 32 && ecc.isXOnlyPoint(bytes)) return pubkey as SparkPubkey
    if (bytes.length === 33 && ecc.isPoint(bytes)) return pubkey as SparkPubkey
  } catch (err) {
    return new MigrationInvalidDestinationError(err)
  }
  return new MigrationInvalidDestinationError(pubkey)
}

export const buildMigrationProofChallenge = ({
  accountId,
  destinationPubkey,
  timestamp,
}: MigrationProofChallengeArgs): string =>
  `migrate:${accountId}-${destinationPubkey}-${timestamp}`

export const verifyMigrationProofOfPossession = ({
  accountId,
  destinationPubkey,
  signature,
  timestamp,
  freshnessWindowMs = MIGRATION_PROOF_FRESHNESS_WINDOW_MS,
}: VerifyMigrationProofArgs): true | MigrationInvalidDestinationError => {
  if (Math.abs(Date.now() - timestamp) > freshnessWindowMs) {
    return new MigrationProofExpiredError(`stale proof timestamp: ${timestamp}`)
  }

  if (!/^[0-9a-f]+$/i.test(signature)) {
    return new MigrationInvalidDestinationError("invalid proof signature encoding")
  }

  const pubkeyBytes = Buffer.from(destinationPubkey, "hex")
  const signatureBytes = Buffer.from(signature, "hex")
  const digest = sha256(
    Buffer.from(
      buildMigrationProofChallenge({ accountId, destinationPubkey, timestamp }),
      "utf8",
    ),
  )

  try {
    if (pubkeyBytes.length === 32) {
      return (
        ecc.verifySchnorr(digest, pubkeyBytes, signatureBytes) ||
        new MigrationInvalidDestinationError("invalid proof signature")
      )
    }
    if (pubkeyBytes.length === 33) {
      return (
        ecc.verify(digest, pubkeyBytes, signatureBytes) ||
        new MigrationInvalidDestinationError("invalid proof signature")
      )
    }
    return new MigrationInvalidDestinationError("unsupported pubkey length")
  } catch (err) {
    return new MigrationInvalidDestinationError(err)
  }
}
