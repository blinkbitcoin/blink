import { DomainError } from "@/domain/shared"

export const LnurlSuccessActionTag = {
  Message: "message",
  Url: "url",
  Aes: "aes",
} as const

export type LnurlSuccessActionTag =
  (typeof LnurlSuccessActionTag)[keyof typeof LnurlSuccessActionTag]

export type LnurlSuccessActionMessage = {
  tag: typeof LnurlSuccessActionTag.Message
  message: string
}

export type LnurlSuccessActionUrl = {
  tag: typeof LnurlSuccessActionTag.Url
  description: string
  url: string
}

export type LnurlSuccessActionAes = {
  tag: typeof LnurlSuccessActionTag.Aes
  description: string
  ciphertext: string
  iv: string
}

export type LnurlSuccessAction =
  | LnurlSuccessActionMessage
  | LnurlSuccessActionUrl
  | LnurlSuccessActionAes

export class InvalidLnurlSuccessActionError extends DomainError {
  constructor(reason?: string) {
    super(reason ?? "Invalid LNURL success action")
  }
}

export const checkedToLnurlSuccessAction = (
  input: unknown,
): LnurlSuccessAction | null | InvalidLnurlSuccessActionError => {
  if (input === null || input === undefined) {
    return null
  }

  if (typeof input !== "object") {
    return new InvalidLnurlSuccessActionError("Input must be an object")
  }

  const obj = input as Record<string, unknown>
  const tag = obj.tag

  if (typeof tag !== "string") {
    return new InvalidLnurlSuccessActionError("Missing or invalid tag")
  }

  switch (tag) {
    case LnurlSuccessActionTag.Message: {
      const message = obj.message
      if (typeof message !== "string") {
        return new InvalidLnurlSuccessActionError("Message tag requires message field")
      }
      return { tag: LnurlSuccessActionTag.Message, message }
    }

    case LnurlSuccessActionTag.Url: {
      const description = obj.description
      const url = obj.url
      if (typeof url !== "string") {
        return new InvalidLnurlSuccessActionError("URL tag requires url field")
      }
      return {
        tag: LnurlSuccessActionTag.Url,
        description: typeof description === "string" ? description : "",
        url,
      }
    }

    case LnurlSuccessActionTag.Aes: {
      const description = obj.description
      const ciphertext = obj.ciphertext
      const iv = obj.iv
      if (typeof ciphertext !== "string") {
        return new InvalidLnurlSuccessActionError("AES tag requires ciphertext field")
      }
      if (typeof iv !== "string") {
        return new InvalidLnurlSuccessActionError("AES tag requires iv field")
      }
      return {
        tag: LnurlSuccessActionTag.Aes,
        description: typeof description === "string" ? description : "",
        ciphertext,
        iv,
      }
    }

    default:
      return new InvalidLnurlSuccessActionError(`Unknown tag: ${tag}`)
  }
}
