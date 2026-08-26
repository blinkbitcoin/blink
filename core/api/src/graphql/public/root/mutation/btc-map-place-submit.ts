import { BtcMap } from "@/app"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import { GT } from "@/graphql/index"
import BtcMapPlacePayload from "@/graphql/public/types/payload/btc-map-place"

const BtcMapPlaceSubmitInput = GT.Input({
  name: "BtcMapPlaceSubmitInput",
  fields: () => ({
    latitude: {
      type: GT.NonNull(GT.Float),
    },
    longitude: {
      type: GT.NonNull(GT.Float),
    },
    category: {
      type: GT.NonNull(GT.String),
    },
    name: {
      type: GT.NonNull(GT.String),
    },
  }),
})

const BtcMapPlaceSubmitMutation = GT.Field<null, GraphQLPublicContextAuth>({
  extensions: {
    complexity: 120,
  },
  description:
    "Submit a place to BTC Map. The place is sent to BTC Map for review and only appears on the map once approved.",
  type: GT.NonNull(BtcMapPlacePayload),
  args: {
    input: { type: GT.NonNull(BtcMapPlaceSubmitInput) },
  },
  resolve: async (_, args, { domainAccount }) => {
    const { latitude, longitude, category, name } = args.input

    const place = await BtcMap.submitPlace({
      account: domainAccount,
      latitude,
      longitude,
      category,
      name,
    })

    if (place instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(place)] }
    }

    return {
      errors: [],
      place,
    }
  },
})

export default BtcMapPlaceSubmitMutation
