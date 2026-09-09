import dedent from "dedent"

import ContactAlias from "../scalar/contact-alias"

import Username from "../../../shared/types/scalar/username"
import Handle from "../../../shared/types/scalar/contact-handle"

import { TransactionConnection } from "../../../shared/types/object/transaction"

import { Accounts } from "@/app"
import { checkedToHandle } from "@/domain/contacts"
import { GT } from "@/graphql/index"
import { connectionArgs } from "@/graphql/connections"
import { mapError } from "@/graphql/error-map"

const AccountContact = GT.Object<AccountContact, GraphQLPublicContextAuth>({
  name: "UserContact",
  fields: () => ({
    id: { type: GT.NonNull(Handle) },
    handle: {
      type: GT.NonNull(Handle),
      description: "Identifier of the contact (username or Lightning address).",
    },
    username: {
      type: GT.NonNull(Username),
      description: "Actual identifier of the contact. Deprecated: use `handle` instead.",
      deprecationReason: "Use `handle` field; this will be removed in a future release.",
      resolve: (src) => src.handle,
    },
    alias: {
      type: ContactAlias,
      description: dedent`Alias the user can set for this contact.
        Only the user can see the alias attached to their contact.`,
    },
    transactionsCount: {
      type: GT.NonNull(GT.Int),
    },
    transactions: {
      type: TransactionConnection,
      args: connectionArgs,
      resolve: async (source, args, { domainAccount }) => {
        const contactHandle = checkedToHandle(source.handle)

        if (contactHandle instanceof Error) {
          throw mapError(contactHandle)
        }

        const account = domainAccount

        if (account instanceof Error) {
          throw account
        }

        const resp = await Accounts.getAccountTransactionsForContact({
          account,
          contactHandle,
          rawPaginationArgs: args,
        })

        if (resp instanceof Error) {
          throw mapError(resp)
        }

        return resp
      },
      description: "Paginated list of transactions sent to/from this contact.",
    },
  }),
})

export default AccountContact
