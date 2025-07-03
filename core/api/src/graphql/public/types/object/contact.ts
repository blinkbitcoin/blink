import ContactId from "@/graphql/shared/types/scalar/contact-id"
import ContactType from "@/graphql/shared/types/scalar/contact-type"
import Handle from "@/graphql/shared/types/scalar/contact-handle"
import ContactDisplayName from "@/graphql/public/types/scalar/contact-display-name"
import Timestamp from "@/graphql/shared/types/scalar/timestamp"
import { GT } from "@/graphql/index"

const Contact = GT.Object<ContactRecord, GraphQLPublicContextAuth>({
  name: "Contact",
  fields: () => ({
    id: {
      type: GT.NonNull(ContactId),
      description: "ID of the contact user or external handle.",
    },
    type: {
      type: GT.NonNull(ContactType),
      description: "Type of the contact (intraledger, lnaddress, etc.).",
    },
    handle: {
      type: GT.NonNull(Handle),
      description: "Username or lnAddress that identifies the contact.",
    },
    displayName: {
      type: ContactDisplayName,
      description: "DisplayName name the user assigns to the contact.",
    },
    transactionsCount: {
      type: GT.NonNull(GT.Int),
      description: "Total number of transactions with this contact.",
    },
    createdAt: {
      type: GT.NonNull(Timestamp),
      description:
        "Unix timestamp (number of seconds elapsed since January 1, 1970 00:00:00 UTC)",
    },
  }),
})

export default Contact
