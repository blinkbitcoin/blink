import ContactPayload from "@/graphql/public/types/payload/contact"
import ContactHandle from "@/graphql/shared/types/scalar/contact-handle"
import ContactDisplayName from "@/graphql/public/types/scalar/contact-alias"
import ContactType from "@/graphql/shared/types/scalar/contact-type"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import { GT } from "@/graphql/index"

import { Accounts } from "@/app"

const ContactCreateInput = GT.Input({
  name: "ContactCreateInput",
  fields: () => ({
    handle: { type: ContactHandle },
    displayName: { type: ContactDisplayName },
    type: { type: GT.NonNull(ContactType) },
  }),
})

const ContactCreateMutation = GT.Field({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(ContactPayload),
  args: {
    input: { type: GT.NonNull(ContactCreateInput) },
  },
  resolve: async (_, args, { domainAccount }: { domainAccount: Account }) => {
    const { handle, displayName, type } = args.input

    if (handle instanceof Error) {
      return { errors: [{ message: handle.message }] }
    }

    if (type instanceof Error) {
      return { errors: [{ message: type.message }] }
    }

    if (displayName instanceof Error) {
      return { errors: [{ message: displayName.message }] }
    }

    const result = await Accounts.createContact({
      accountId: domainAccount.id,
      handle,
      displayName,
      type,
    })

    if (result instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(result)] }
    }

    return {
      errors: [],
      contact: result,
    }
  },
})

export default ContactCreateMutation
