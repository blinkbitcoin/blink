import {
  BOLT11_MAX_MEMO_BYTES,
  isCommentWithinBolt11MemoLimit,
  isCommentWithinLnurlLimit,
  LNURL_COMMENT_MAX_CHARACTERS,
  sanitizeComment,
} from "@/app/lnurlp/[username]/comment"

describe("comment sanitization and bolt11 limits", () => {
  describe("sanitizeComment", () => {
    it("returns null for null and blank values", () => {
      expect(sanitizeComment(null)).toBeNull()
      expect(sanitizeComment("   \n\t   ")).toBeNull()
    })

    it("returns null for empty string", () => {
      expect(sanitizeComment("")).toBeNull()
    })

    it("returns null for undefined", () => {
      expect(sanitizeComment(undefined)).toBeNull()
    })

    it("returns null when all characters are disallowed", () => {
      expect(sanitizeComment("\u200b\u200e\ufeff")).toBeNull()
    })

    it("returns null when result is empty after trimming post-sanitization", () => {
      expect(sanitizeComment("\ufeff   \u200b")).toBeNull()
    })

    it("removes ascii control characters except tab/newline/carriage return", () => {
      expect(sanitizeComment("hi\u0000there\u0008!")).toBe("hithere!")
      expect(sanitizeComment("line1\nline2\tend\r")).toBe("line1\nline2\tend")
    })

    it("removes DEL character (0x7f)", () => {
      expect(sanitizeComment("hi\u007fthere")).toBe("hithere")
    })

    it("removes C1 control codes (0x80-0x9f)", () => {
      expect(sanitizeComment("hi\u0080there")).toBe("hithere")
      expect(sanitizeComment("hi\u0085there")).toBe("hithere")
      expect(sanitizeComment("hi\u009fthere")).toBe("hithere")
    })

    it("removes all zero-width and bidi characters", () => {
      expect(sanitizeComment("a\u200bb")).toBe("ab") // ZERO WIDTH SPACE
      expect(sanitizeComment("a\u200cb")).toBe("ab") // ZERO WIDTH NON-JOINER
      expect(sanitizeComment("a\u200db")).toBe("ab") // ZERO WIDTH JOINER
      expect(sanitizeComment("a\u200eb")).toBe("ab") // LEFT-TO-RIGHT MARK
      expect(sanitizeComment("a\u200fb")).toBe("ab") // RIGHT-TO-LEFT MARK
      expect(sanitizeComment("a\u202ab")).toBe("ab") // LEFT-TO-RIGHT EMBEDDING
      expect(sanitizeComment("a\u202bb")).toBe("ab") // RIGHT-TO-LEFT EMBEDDING
      expect(sanitizeComment("a\u202cb")).toBe("ab") // POP DIRECTIONAL FORMATTING
      expect(sanitizeComment("a\u202db")).toBe("ab") // LEFT-TO-RIGHT OVERRIDE
      expect(sanitizeComment("a\u202eb")).toBe("ab") // RIGHT-TO-LEFT OVERRIDE
      expect(sanitizeComment("a\u2060b")).toBe("ab") // WORD JOINER
      expect(sanitizeComment("a\u2061b")).toBe("ab") // FUNCTION APPLICATION
      expect(sanitizeComment("a\u2062b")).toBe("ab") // INVISIBLE TIMES
      expect(sanitizeComment("a\u2063b")).toBe("ab") // INVISIBLE SEPARATOR
      expect(sanitizeComment("a\u2064b")).toBe("ab") // INVISIBLE PLUS
      expect(sanitizeComment("a\u2065b")).toBe("ab") // RESERVED
      expect(sanitizeComment("a\u2066b")).toBe("ab") // LEFT-TO-RIGHT ISOLATE
      expect(sanitizeComment("a\u2067b")).toBe("ab") // RIGHT-TO-LEFT ISOLATE
      expect(sanitizeComment("a\u2068b")).toBe("ab") // FIRST STRONG ISOLATE
      expect(sanitizeComment("a\u2069b")).toBe("ab") // POP DIRECTIONAL ISOLATE
      expect(sanitizeComment("a\ufeffb")).toBe("ab") // BOM
    })

    it("trims leading and trailing whitespace from result", () => {
      expect(sanitizeComment("  hello  ")).toBe("hello")
    })

    it("keeps regular unicode content", () => {
      const input = "Pago por cafe con emoji ☕"
      expect(sanitizeComment(input)).toBe(input)
    })

    it("preserves astral plane / surrogate pair characters", () => {
      expect(sanitizeComment("𝄞 music note")).toBe("𝄞 music note")
    })
  })

  describe("isCommentWithinLnurlLimit", () => {
    it("allows empty string", () => {
      expect(isCommentWithinLnurlLimit("")).toBe(true)
    })

    it("uses default LNURL character limit", () => {
      expect(isCommentWithinLnurlLimit("a".repeat(LNURL_COMMENT_MAX_CHARACTERS))).toBe(
        true,
      )
      expect(
        isCommentWithinLnurlLimit("a".repeat(LNURL_COMMENT_MAX_CHARACTERS + 1)),
      ).toBe(false)
    })

    it("counts unicode codepoints not utf-16 code units", () => {
      expect(isCommentWithinLnurlLimit("🙂".repeat(LNURL_COMMENT_MAX_CHARACTERS))).toBe(
        true,
      )
      expect(
        isCommentWithinLnurlLimit("🙂".repeat(LNURL_COMMENT_MAX_CHARACTERS + 1)),
      ).toBe(false)
    })
  })

  describe("isCommentWithinBolt11MemoLimit", () => {
    it("allows empty string", () => {
      expect(isCommentWithinBolt11MemoLimit("")).toBe(true)
    })

    it("enforces bolt11 byte limit with ascii chars", () => {
      expect(isCommentWithinBolt11MemoLimit("a".repeat(BOLT11_MAX_MEMO_BYTES))).toBe(true)
      expect(isCommentWithinBolt11MemoLimit("a".repeat(BOLT11_MAX_MEMO_BYTES + 1))).toBe(
        false,
      )
    })

    it("counts 2-byte utf8 chars correctly", () => {
      const twoByteChar = "é"
      const count = Math.floor(BOLT11_MAX_MEMO_BYTES / 2) // 319
      expect(isCommentWithinBolt11MemoLimit(twoByteChar.repeat(count))).toBe(true)
      expect(isCommentWithinBolt11MemoLimit(twoByteChar.repeat(count + 1))).toBe(false)
    })

    it("counts 3-byte utf8 chars correctly", () => {
      const threeByteChar = "☕"
      const count = Math.floor(BOLT11_MAX_MEMO_BYTES / 3) // 213
      expect(isCommentWithinBolt11MemoLimit(threeByteChar.repeat(count))).toBe(true)
      expect(isCommentWithinBolt11MemoLimit(threeByteChar.repeat(count + 1))).toBe(false)
    })

    it("counts 4-byte utf8 chars (emoji) correctly", () => {
      const fourByteChar = "🙂"
      const count = Math.floor(BOLT11_MAX_MEMO_BYTES / 4) // 159
      expect(isCommentWithinBolt11MemoLimit(fourByteChar.repeat(count))).toBe(true)
      expect(isCommentWithinBolt11MemoLimit(fourByteChar.repeat(count + 1))).toBe(false)
    })

    it("handles mixed ascii and multibyte chars at exact byte boundary", () => {
      const emoji = "🙂" // 4 bytes
      const padding = "a".repeat(BOLT11_MAX_MEMO_BYTES - 4)
      expect(isCommentWithinBolt11MemoLimit(emoji + padding)).toBe(true)
      expect(isCommentWithinBolt11MemoLimit(emoji + padding + "a")).toBe(false)
    })
  })

  describe("integration", () => {
    it("comment bloated with bidi chars is within bolt11 limit after sanitization", () => {
      const bloatedInput = "a".repeat(BOLT11_MAX_MEMO_BYTES - 1) + "\ufeff\ufeff"
      const cleaned = sanitizeComment(bloatedInput)
      expect(cleaned).not.toBeNull()
      expect(isCommentWithinBolt11MemoLimit(cleaned as string)).toBe(true)
    })

    it("ascii comment within LNURL limit also satisfies BOLT11 byte limit", () => {
      const raw = "a".repeat(LNURL_COMMENT_MAX_CHARACTERS)
      expect(isCommentWithinLnurlLimit(raw)).toBe(true)
      const cleaned = sanitizeComment(raw)!
      expect(isCommentWithinBolt11MemoLimit(cleaned)).toBe(true)
    })

    it("worst-case LNURL comment (all 4-byte emoji) exceeds BOLT11 byte limit", () => {
      // Documents that both limits must be checked independently:
      // 280 emoji × 4 bytes = 1120 bytes > 639 byte BOLT11 limit
      const raw = "🙂".repeat(LNURL_COMMENT_MAX_CHARACTERS)
      expect(isCommentWithinLnurlLimit(raw)).toBe(true)
      const cleaned = sanitizeComment(raw)!
      expect(isCommentWithinBolt11MemoLimit(cleaned)).toBe(false)
    })
  })
})
