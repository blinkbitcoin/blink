import { GT } from "@/graphql/index"

const BtcMapPlace = GT.Object({
  name: "BtcMapPlace",
  fields: () => ({
    id: { type: GT.NonNullID },
    origin: { type: GT.NonNull(GT.String) },
    externalId: { type: GT.NonNull(GT.String) },
  }),
})

export default BtcMapPlace
