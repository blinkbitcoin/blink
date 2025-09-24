import { GT } from "@/graphql/index"

import { Authentication } from "@/app"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import EmailAddress from "@/graphql/shared/types/scalar/email-address"
import UserEmailRegistrationInitiatePayload from "@/graphql/public/types/payload/user-email-registration-initiate"

const UserEmailRegistrationInitiateInput = GT.Input({
  name: "UserEmailRegistrationInitiateInput",
  fields: () => ({
    email: {
      type: GT.NonNull(EmailAddress),
    },
    requireUniqueEmail: { type: GT.Boolean, defaultValue: false },
  }),
})

const UserEmailRegistrationInitiateMutation = GT.Field<
  null,
  GraphQLPublicContextAuth,
  {
    input: {
      email: EmailAddress | InputValidationError
      requireUniqueEmail?: boolean | InputValidationError
    }
  }
>({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(UserEmailRegistrationInitiatePayload),
  args: {
    input: { type: GT.NonNull(UserEmailRegistrationInitiateInput) },
  },
  resolve: async (_, args, { user }) => {
    const { email, requireUniqueEmail } = args.input

    if (email instanceof Error) {
      return { errors: [{ message: email.message }] }
    }

    if (requireUniqueEmail instanceof Error) {
      return { errors: [{ message: requireUniqueEmail.message }] }
    }

    const res = await Authentication.addEmailToIdentity({
      email,
      userId: user.id,
      requireUniqueEmail,
    })

    if (res instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(res)], success: false }
    }

    const { emailRegistrationId, me } = res

    return { errors: [], emailRegistrationId, me }
  },
})

export default UserEmailRegistrationInitiateMutation
