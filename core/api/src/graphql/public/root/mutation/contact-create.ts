import ContactCreatePayload from "@/graphql/public/types/payload/contact-create"
import ContactIdentifier from "@/graphql/shared/types/scalar/contact-identifier"
import ContactAlias from "@/graphql/public/types/scalar/contact-alias"
import ContactType from "@/graphql/shared/types/scalar/contact-type"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import { GT } from "@/graphql/index"

import { Contacts } from "@/app"

const ContactCreateInput = GT.Input({
  name: "ContactCreateInput",
  fields: () => ({
    identifier: { type: ContactIdentifier },
    alias: { type: ContactAlias },
    type: { type: GT.NonNull(ContactType) },
  }),
})

const ContactCreateMutation = GT.Field({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(ContactCreatePayload),
  args: {
    input: { type: GT.NonNull(ContactCreateInput) },
  },
  resolve: async (_, args, { domainAccount }: { domainAccount: Account }) => {
    const { identifier, alias, type } = args.input

    if (type instanceof Error) {
      return { errors: [{ message: type.message }] }
    }

    if (alias instanceof Error) {
      return { errors: [{ message: alias.message }] }
    }

    const result = await Contacts.contactCreate({
      accountId: domainAccount.id,
      identifier,
      alias,
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
