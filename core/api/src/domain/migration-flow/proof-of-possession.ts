import { createHash } from "crypto"

import * as ecc from "tiny-secp256k1"

import { MigrationInvalidDestinationError, MigrationProofExpiredError } from "./errors"

export const MIGRATION_PROOF_FRESHNESS_WINDOW_SECONDS = 600 as Seconds

const sha256 = (buffer: Buffer) => createHash("sha256").update(buffer).digest()

const derToCompactSignature = (
  der: Buffer,
): Buffer | MigrationInvalidDestinationError => {
  const invalid = new MigrationInvalidDestinationError("invalid proof signature encoding")

  if (der.length < 8 || der[0] !== 0x30 || der[1] !== der.length - 2) return invalid

  const readInteger = (offset: number): { value: Buffer; end: number } | null => {
    if (offset + 2 > der.length || der[offset] !== 0x02) return null
    const length = der[offset + 1]
    const start = offset + 2
    const end = start + length
    if (length === 0 || end > der.length) return null
    let value = der.subarray(start, end)
    if (value[0] & 0x80) return null
    if (value[0] === 0x00) {
      if (value.length === 1 || (value[1] & 0x80) === 0) return null
      value = value.subarray(1)
    }
    if (value.length > 32) return null
    return { value, end }
  }

  const r = readInteger(2)
  if (!r) return invalid
  const s = readInteger(r.end)
  if (!s || s.end !== der.length) return invalid

  const compact = Buffer.alloc(64)
  r.value.copy(compact, 32 - r.value.length)
  s.value.copy(compact, 64 - s.value.length)
  return compact
}

// compressed keys only: every Spark SDK surface emits 66-hex compressed
export const checkedToSparkPubkey = (
  pubkey: string,
): SparkPubkey | MigrationInvalidDestinationError => {
  if (!/^[0-9a-f]{66}$/i.test(pubkey)) {
    return new MigrationInvalidDestinationError(pubkey)
  }

  try {
    if (ecc.isPoint(Buffer.from(pubkey, "hex"))) return pubkey as SparkPubkey
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
  freshnessWindowSeconds = MIGRATION_PROOF_FRESHNESS_WINDOW_SECONDS,
}: VerifyMigrationProofArgs): true | MigrationInvalidDestinationError => {
  const nowInSeconds = Math.floor(Date.now() / 1000)
  if (Math.abs(nowInSeconds - timestamp) > freshnessWindowSeconds) {
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
    if (pubkeyBytes.length !== 33) {
      return new MigrationInvalidDestinationError("unsupported pubkey length")
    }

    if (signatureBytes.length === 64) {
      return (
        ecc.verify(digest, pubkeyBytes, signatureBytes) ||
        new MigrationInvalidDestinationError("invalid proof signature")
      )
    }

    if (signatureBytes.length > 64) {
      const compact = derToCompactSignature(signatureBytes)
      if (compact instanceof Error) return compact
      return (
        ecc.verify(digest, pubkeyBytes, compact) ||
        new MigrationInvalidDestinationError("invalid proof signature")
      )
    }

    return new MigrationInvalidDestinationError("invalid proof signature encoding")
  } catch (err) {
    return new MigrationInvalidDestinationError(err)
  }
}
