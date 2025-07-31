import { checkedToDisplayName } from "@/domain/contacts"

import { InputValidationError } from "@/graphql/error"
import { GT } from "@/graphql/index"

const ContactAlias = GT.Scalar({
  name: "ContactAlias",
  description:
    "An alias name that a user can set for a wallet (with which they have transactions)",
  parseValue(value) {
    if (typeof value !== "string") {
      return new InputValidationError({ message: "Invalid type for AuthToken" })
    }
    return validContactAliasValue(value)
  },
  parseLiteral(ast) {
    if (ast.kind === GT.Kind.STRING) {
      return validContactAliasValue(ast.value)
    }
    return new InputValidationError({ message: "Invalid type for ContactAlias" })
  },
})

function validContactAliasValue(value: string) {
  const result = checkedToDisplayName(value)
  if (result instanceof Error) {
    return new InputValidationError({ message: "Invalid value for ContactAlias" })
  }
  return result
}

export default ContactAlias
