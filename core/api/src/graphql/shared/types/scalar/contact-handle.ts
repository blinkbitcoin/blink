import { checkedToHandle } from "@/domain/contacts"
import { InputValidationError } from "@/graphql/error"
import { GT } from "@/graphql/index"

const Handle = GT.Scalar<string | InputValidationError>({
  name: "ContactHandle",
  description: "Unique handle used to identify a contact (e.g., username or lnAddress)",
  parseValue(value) {
    if (typeof value !== "string") {
      return new InputValidationError({ message: "Invalid type for Handle" })
    }
    return validHandleValue(value)
  },
  parseLiteral(ast) {
    if (ast.kind === GT.Kind.STRING) {
      return validHandleValue(ast.value)
    }
    return new InputValidationError({ message: "Invalid type for Handle" })
  },
})

function validHandleValue(value: string): string | InputValidationError {
  const checked = checkedToHandle(value)
  if (checked instanceof Error) {
    return new InputValidationError({ message: "Invalid value for Handle" })
  }
  return checked
}

export default Handle
