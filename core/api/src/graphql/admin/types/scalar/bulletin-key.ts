import { checkedToBulletinKey } from "@/domain/notifications"
import { GT } from "@/graphql/index"
import { InputValidationError } from "@/graphql/error"

const BulletinKey = GT.Scalar<BulletinKey | InputValidationError>({
  name: "BulletinKey",
  description:
    "Identifier that groups bulletins so that a user has at most one active bulletin per key",
  parseValue(value) {
    if (typeof value !== "string") {
      return new InputValidationError({ message: "Invalid type for BulletinKey" })
    }
    return validBulletinKeyValue(value)
  },
  parseLiteral(ast) {
    if (ast.kind === GT.Kind.STRING) {
      return validBulletinKeyValue(ast.value)
    }
    return new InputValidationError({ message: "Invalid type for BulletinKey" })
  },
})

function validBulletinKeyValue(value: string): BulletinKey | InputValidationError {
  const checkedBulletinKey = checkedToBulletinKey(value)
  if (checkedBulletinKey instanceof Error) {
    return new InputValidationError({ message: "Invalid value for BulletinKey" })
  }
  return checkedBulletinKey
}

export default BulletinKey
