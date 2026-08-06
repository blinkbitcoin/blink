import { GT } from "@/graphql/index"

const CustodialRestrictions = GT.Object<CustodialRestrictions, GraphQLPublicContextAuth>({
  name: "CustodialRestrictions",
  fields: () => ({
    dollarBalance: {
      type: GT.NonNull(GT.Boolean),
    },
    transfer: {
      type: GT.NonNull(GT.Boolean),
    },
  }),
})

export default CustodialRestrictions
