import Contact from "../object/contact"

import IError from "@/graphql/shared/types/abstract/error"
import { GT } from "@/graphql/index"

const ContactPayload = GT.Object({
  name: "ContactPayload",
  fields: () => ({
    errors: {
      type: GT.NonNullList(IError),
    },
    contact: {
      type: Contact,
    },
  }),
})

export default ContactPayload
