import { BtcMap } from "@/app"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import { GT } from "@/graphql/index"
import BtcMapPlacePayload from "@/graphql/public/types/payload/btc-map-place"

const BtcMapPlaceSubmitInput = GT.Input({
  name: "BtcMapPlaceSubmitInput",
  fields: () => ({
    submissionId: {
      type: GT.NonNull(GT.ID),
      description:
        "Client-generated UUID identifying this submission. Reuse the same value when retrying after a failed or ambiguous request so the retry does not create a duplicate place. Resubmitting with the same submissionId and different place fields updates the original submission instead.",
    },
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
    "Submit a place to BTC Map. Submissions from trusted sources appear on BTC Map right away; BTC Map editors process them later for eventual inclusion in OpenStreetMap.",
  type: GT.NonNull(BtcMapPlacePayload),
  args: {
    input: { type: GT.NonNull(BtcMapPlaceSubmitInput) },
  },
  resolve: async (_, args, { domainAccount }) => {
    const { submissionId, latitude, longitude, category, name } = args.input

    const place = await BtcMap.submitPlace({
      account: domainAccount,
      submissionId,
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
