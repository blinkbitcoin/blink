import {
  checkedToLnurlSuccessAction,
  LnurlSuccessActionTag,
  LnurlSuccessAction,
} from "@/domain/bitcoin/lnurl"

describe("LnurlSuccessAction", () => {
  describe("checkedToLnurlSuccessAction", () => {
    describe("message tag", () => {
      it("should parse valid message success action", () => {
        const input = {
          tag: "message",
          message: "Thank you for your payment!",
        }

        const result = checkedToLnurlSuccessAction(input)
        expect(result).not.toBeInstanceOf(Error)
        expect(result).not.toBeNull()
        const action = result as LnurlSuccessAction
        expect(action.tag).toBe(LnurlSuccessActionTag.Message)
        if (action.tag === LnurlSuccessActionTag.Message) {
          expect(action.message).toBe("Thank you for your payment!")
        }
      })

      it("should reject message action without message field", () => {
        const input = {
          tag: "message",
        }

        const result = checkedToLnurlSuccessAction(input)
        expect(result).toBeInstanceOf(Error)
      })
    })

    describe("url tag", () => {
      it("should parse valid url success action", () => {
        const input = {
          tag: "url",
          description: "Click to view your receipt",
          url: "https://example.com/receipt",
        }

        const result = checkedToLnurlSuccessAction(input)
        expect(result).not.toBeInstanceOf(Error)
        expect(result).not.toBeNull()
        const action = result as LnurlSuccessAction
        expect(action.tag).toBe(LnurlSuccessActionTag.Url)
        if (action.tag === LnurlSuccessActionTag.Url) {
          expect(action.description).toBe("Click to view your receipt")
          expect(action.url).toBe("https://example.com/receipt")
        }
      })

      it("should reject url action without url field", () => {
        const input = {
          tag: "url",
          description: "Click here",
        }

        const result = checkedToLnurlSuccessAction(input)
        expect(result).toBeInstanceOf(Error)
      })
    })

    describe("aes tag", () => {
      it("should parse valid aes success action", () => {
        const input = {
          tag: "aes",
          description: "Encrypted content",
          ciphertext: "base64encrypteddata==",
          iv: "base64iv==",
        }

        const result = checkedToLnurlSuccessAction(input)
        expect(result).not.toBeInstanceOf(Error)
        expect(result).not.toBeNull()
        const action = result as LnurlSuccessAction
        expect(action.tag).toBe(LnurlSuccessActionTag.Aes)
        if (action.tag === LnurlSuccessActionTag.Aes) {
          expect(action.description).toBe("Encrypted content")
          expect(action.ciphertext).toBe("base64encrypteddata==")
          expect(action.iv).toBe("base64iv==")
        }
      })

      it("should reject aes action without ciphertext", () => {
        const input = {
          tag: "aes",
          description: "Encrypted content",
          iv: "base64iv==",
        }

        const result = checkedToLnurlSuccessAction(input)
        expect(result).toBeInstanceOf(Error)
      })

      it("should reject aes action without iv", () => {
        const input = {
          tag: "aes",
          description: "Encrypted content",
          ciphertext: "base64encrypteddata==",
        }

        const result = checkedToLnurlSuccessAction(input)
        expect(result).toBeInstanceOf(Error)
      })
    })

    describe("null/undefined input", () => {
      it("should return null for null input", () => {
        const result = checkedToLnurlSuccessAction(null)
        expect(result).toBeNull()
      })

      it("should return null for undefined input", () => {
        const result = checkedToLnurlSuccessAction(undefined)
        expect(result).toBeNull()
      })
    })

    describe("invalid tag", () => {
      it("should reject unknown tag", () => {
        const input = {
          tag: "unknown",
        }

        const result = checkedToLnurlSuccessAction(input)
        expect(result).toBeInstanceOf(Error)
      })
    })
  })
})
