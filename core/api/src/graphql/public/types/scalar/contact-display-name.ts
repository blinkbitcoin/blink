import { checkedToDisplayName } from "@/domain/contacts"

import { InputValidationError } from "@/graphql/error"
import { GT } from "@/graphql/index"

const ContactDisplayName = GT.Scalar({
  name: "ContactDisplayName",
  description: "A display name that a user can assign to a contact",
  parseValue(value) {
    if (typeof value !== "string") {
      return new InputValidationError({ message: "Invalid type for ContactDisplayName" })
    }
    return validateContactDisplayName(value)
  },
  parseLiteral(ast) {
    if (ast.kind === GT.Kind.STRING) {
      return validateContactDisplayName(ast.value)
    }
    return new InputValidationError({ message: "Invalid type for ContactDisplayName" })
  },
})

function validateContactDisplayName(value: string) {
  const result = checkedToDisplayName(value)
  if (result instanceof Error) {
    return new InputValidationError({ message: "Invalid value for ContactDisplayName" })
  }
  return result
}

export default ContactDisplayName
