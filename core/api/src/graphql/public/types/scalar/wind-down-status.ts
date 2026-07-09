import { GT } from "@/graphql/index"

const WindDownStatus = GT.Enum({
  name: "WindDownStatus",
  values: {
    PRE_CUTOFF: { value: "PRE_CUTOFF" },
    RECEIVE_DISABLED: { value: "RECEIVE_DISABLED" },
    GATED_CLOSED: { value: "GATED_CLOSED" },
  },
})

export default WindDownStatus
