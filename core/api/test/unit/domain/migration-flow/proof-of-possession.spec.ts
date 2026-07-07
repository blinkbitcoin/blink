import { createHash } from "crypto"

import * as ecc from "tiny-secp256k1"

import {
  buildMigrationProofChallenge,
  checkedToSparkPubkey,
  MIGRATION_PROOF_FRESHNESS_WINDOW_MS,
  MigrationInvalidDestinationError,
  MigrationProofExpiredError,
  verifyMigrationProofOfPossession,
} from "@/domain/migration-flow"

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest()

const privateKey = Buffer.alloc(32, 7)
const otherPrivateKey = Buffer.alloc(32, 11)

const xOnlyPubkey = Buffer.from(ecc.xOnlyPointFromScalar(privateKey)).toString(
  "hex",
) as SparkPubkey
const compressedPubkey = Buffer.from(
  ecc.pointFromScalar(privateKey, true) as Uint8Array,
).toString("hex") as SparkPubkey
const otherXOnlyPubkey = Buffer.from(ecc.xOnlyPointFromScalar(otherPrivateKey)).toString(
  "hex",
) as SparkPubkey

const accountId = "account-id" as AccountId

const challengeDigest = ({
  destinationPubkey,
  timestamp,
}: {
  destinationPubkey: SparkPubkey
  timestamp: number
}) =>
  sha256(
    Buffer.from(
      buildMigrationProofChallenge({ accountId, destinationPubkey, timestamp }),
      "utf8",
    ),
  )

const signSchnorrProof = ({
  destinationPubkey,
  timestamp,
  key = privateKey,
}: {
  destinationPubkey: SparkPubkey
  timestamp: number
  key?: Buffer
}) =>
  Buffer.from(
    ecc.signSchnorr(challengeDigest({ destinationPubkey, timestamp }), key),
  ).toString("hex")

const signEcdsaProof = ({
  destinationPubkey,
  timestamp,
}: {
  destinationPubkey: SparkPubkey
  timestamp: number
}) =>
  Buffer.from(
    ecc.sign(challengeDigest({ destinationPubkey, timestamp }), privateKey),
  ).toString("hex")

describe("buildMigrationProofChallenge", () => {
  it("is domain-separated and binds account, destination and timestamp", () => {
    const challenge = buildMigrationProofChallenge({
      accountId,
      destinationPubkey: xOnlyPubkey,
      timestamp: 1234,
    })
    expect(challenge).toBe(`migrate:${accountId}-${xOnlyPubkey}-1234`)
  })
})

describe("verifyMigrationProofOfPossession", () => {
  it("verifies a schnorr signature for a 32-byte x-only pubkey", () => {
    const timestamp = Date.now()
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: xOnlyPubkey,
      signature: signSchnorrProof({ destinationPubkey: xOnlyPubkey, timestamp }),
      timestamp,
    })
    expect(result).toBe(true)
  })

  it("verifies an ecdsa signature for a 33-byte compressed pubkey", () => {
    const timestamp = Date.now()
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: compressedPubkey,
      signature: signEcdsaProof({ destinationPubkey: compressedPubkey, timestamp }),
      timestamp,
    })
    expect(result).toBe(true)
  })

  it("rejects a tampered signature", () => {
    const timestamp = Date.now()
    const signature = signSchnorrProof({ destinationPubkey: xOnlyPubkey, timestamp })
    const tampered = (signature.slice(0, 1) === "0" ? "1" : "0") + signature.slice(1)

    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: xOnlyPubkey,
      signature: tampered,
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
  })

  it("rejects a signature made by a different key", () => {
    const timestamp = Date.now()
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: otherXOnlyPubkey,
      signature: signSchnorrProof({
        destinationPubkey: otherXOnlyPubkey,
        timestamp,
        key: privateKey,
      }),
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
  })

  it("rejects a signature over a challenge for a different destination", () => {
    const timestamp = Date.now()
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: xOnlyPubkey,
      signature: signSchnorrProof({
        destinationPubkey: otherXOnlyPubkey,
        timestamp,
      }),
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
  })

  it("rejects a stale timestamp outside the freshness window", () => {
    const timestamp = Date.now() - MIGRATION_PROOF_FRESHNESS_WINDOW_MS - 1000
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: xOnlyPubkey,
      signature: signSchnorrProof({ destinationPubkey: xOnlyPubkey, timestamp }),
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationProofExpiredError)
  })

  it("rejects a future timestamp outside the freshness window", () => {
    const timestamp = Date.now() + MIGRATION_PROOF_FRESHNESS_WINDOW_MS + 1000
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: xOnlyPubkey,
      signature: signSchnorrProof({ destinationPubkey: xOnlyPubkey, timestamp }),
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationProofExpiredError)
  })

  it("accepts a timestamp just inside a custom freshness window", () => {
    const timestamp = Date.now() - 1000
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: xOnlyPubkey,
      signature: signSchnorrProof({ destinationPubkey: xOnlyPubkey, timestamp }),
      timestamp,
      freshnessWindowMs: 2000 as MilliSeconds,
    })
    expect(result).toBe(true)
  })

  it("rejects a timestamp outside a custom freshness window", () => {
    const timestamp = Date.now() - 3000
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: xOnlyPubkey,
      signature: signSchnorrProof({ destinationPubkey: xOnlyPubkey, timestamp }),
      timestamp,
      freshnessWindowMs: 2000 as MilliSeconds,
    })
    expect(result).toBeInstanceOf(MigrationProofExpiredError)
  })

  it("rejects a non-hex signature", () => {
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: xOnlyPubkey,
      signature: "not-hex-at-all",
      timestamp: Date.now(),
    })
    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
  })

  it("rejects a truncated signature", () => {
    const timestamp = Date.now()
    const signature = signSchnorrProof({ destinationPubkey: xOnlyPubkey, timestamp })
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: xOnlyPubkey,
      signature: signature.slice(0, 32),
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
  })

  it("rejects an unsupported pubkey length", () => {
    const timestamp = Date.now()
    const result = verifyMigrationProofOfPossession({
      accountId,
      destinationPubkey: "abcd" as SparkPubkey,
      signature: signSchnorrProof({
        destinationPubkey: "abcd" as SparkPubkey,
        timestamp,
      }),
      timestamp,
    })
    expect(result).toBeInstanceOf(MigrationInvalidDestinationError)
  })
})

describe("checkedToSparkPubkey", () => {
  it("accepts a valid 32-byte x-only pubkey", () => {
    expect(checkedToSparkPubkey(xOnlyPubkey)).toBe(xOnlyPubkey)
  })

  it("accepts a valid 33-byte compressed pubkey", () => {
    expect(checkedToSparkPubkey(compressedPubkey)).toBe(compressedPubkey)
  })

  it("rejects non-hex input", () => {
    expect(checkedToSparkPubkey("zz".repeat(32))).toBeInstanceOf(
      MigrationInvalidDestinationError,
    )
  })

  it("rejects a wrong-length key", () => {
    expect(checkedToSparkPubkey("ab".repeat(20))).toBeInstanceOf(
      MigrationInvalidDestinationError,
    )
  })

  it("rejects an odd-length 65-char hex key instead of truncating a nibble", () => {
    expect(checkedToSparkPubkey(`${xOnlyPubkey}a`)).toBeInstanceOf(
      MigrationInvalidDestinationError,
    )
  })

  it("rejects an odd-length 63-char hex key", () => {
    expect(checkedToSparkPubkey(xOnlyPubkey.slice(0, 63))).toBeInstanceOf(
      MigrationInvalidDestinationError,
    )
  })

  it("rejects 32 bytes that are not a point on the curve", () => {
    expect(checkedToSparkPubkey("00".repeat(32))).toBeInstanceOf(
      MigrationInvalidDestinationError,
    )
  })

  it("rejects 33 bytes with an invalid prefix", () => {
    expect(checkedToSparkPubkey(`05${xOnlyPubkey}`)).toBeInstanceOf(
      MigrationInvalidDestinationError,
    )
  })
})
