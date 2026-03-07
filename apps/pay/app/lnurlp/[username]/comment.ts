import { Buffer } from "node:buffer"

// BOLT11 d-tag max payload size in bytes (UTF-8)
export const BOLT11_MAX_MEMO_BYTES = 639

// LUD-12: commentAllowed is character count, not byte count
export const LNURL_COMMENT_MAX_CHARACTERS = 280

const isDisallowedCharacter = (codePoint: number): boolean => {
  if (codePoint <= 0x1f) {
    return codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d
  }

  if (codePoint === 0x7f) return true
  if (codePoint >= 0x80 && codePoint <= 0x9f) return true

  if (codePoint >= 0x200b && codePoint <= 0x200f) return true
  if (codePoint >= 0x202a && codePoint <= 0x202e) return true
  if (codePoint >= 0x2060 && codePoint <= 0x2065) return true
  if (codePoint >= 0x2066 && codePoint <= 0x2069) return true
  if (codePoint === 0xfeff) return true

  return false
}

export const sanitizeComment = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const chars: string[] = []
  for (const char of trimmed) {
    const codePoint = char.codePointAt(0)
    if (codePoint !== undefined && !isDisallowedCharacter(codePoint)) {
      chars.push(char)
    }
  }

  const result = chars.join("").trim()
  return result || null
}

export const isCommentWithinLnurlLimit = (comment: string): boolean =>
  Array.from(comment).length <= LNURL_COMMENT_MAX_CHARACTERS

export const isCommentWithinBolt11MemoLimit = (comment: string) =>
  Buffer.byteLength(comment, "utf8") <= BOLT11_MAX_MEMO_BYTES
