import { GT } from "@/graphql/index"

const RegionCheck = GT.Object<SessionRegionVerdict, GraphQLPublicContext>({
  name: "RegionCheck",
  fields: () => ({
    countryCode: {
      type: GT.String,
    },
    restricted: {
      type: GT.NonNull(GT.Boolean),
    },
    custodialCreationAllowed: {
      type: GT.NonNull(GT.Boolean),
    },
  }),
})

export default RegionCheck
