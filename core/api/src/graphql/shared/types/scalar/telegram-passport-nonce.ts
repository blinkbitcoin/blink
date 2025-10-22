import { checkedToTelegramPassportNonce } from "@/domain/authentication"
import { InputValidationError } from "@/graphql/error"
import { GT } from "@/graphql/index"

const TelegramPassportNonce = GT.Scalar({
  name: "TelegramPassportNonce",
  description: "Nonce provided by Telegram Passport to validate the login/upgrade flow",
  parseValue(value) {
    if (typeof value !== "string") {
      return new InputValidationError({
        message: "Invalid type for TelegramPassportNonce",
      })
    }
    return validNonceValue(value)
  },
  parseLiteral(ast) {
    if (ast.kind === GT.Kind.STRING) {
      return validNonceValue(ast.value)
    }
    return new InputValidationError({ message: "Invalid type for TelegramPassportNonce" })
  },
})

function validNonceValue(value: string) {
  const nonce = checkedToTelegramPassportNonce(value)
  if (nonce instanceof Error) {
    return new InputValidationError({
      message: "Invalid Telegram Passport nonce",
    })
  }
  return nonce
}

export default TelegramPassportNonce
