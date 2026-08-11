import { createHash } from "crypto"

// Pseudonymizes phone numbers in logs and traces: the digest is stable, so events about
// the same phone can still be correlated, without writing the number itself.
//
// The digest is not a secret. Phone numbers are low-entropy, so anyone can reverse it by
// enumerating the E.164 space -- it keeps the number out of plain sight, nothing more.
//
// The bare phone is hashed without any domain separation on purpose -- every call site
// must produce the same digest for the same number, otherwise the digests never join.
export const hashPhone = (phone: PhoneNumber): PhoneHash =>
  createHash("sha256").update(phone).digest("hex") as PhoneHash
