import { GT } from "@/graphql/index"
import IError from "@/graphql/shared/types/abstract/error"
import BtcMapPlace from "@/graphql/public/types/object/btc-map-place"

const BtcMapPlacePayload = GT.Object({
  name: "BtcMapPlacePayload",
  fields: () => ({
    errors: {
      type: GT.NonNullList(IError),
    },
    place: {
      type: BtcMapPlace,
    },
  }),
})

export default BtcMapPlacePayload
