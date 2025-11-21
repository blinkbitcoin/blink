import { GT } from "@/graphql"

const BlockInfo = GT.Object({
  name: "BlockInfo",
  fields: () => ({
    blockHash: { type: GT.String },
    blockHeight: { type: GT.Int },
  }),
})

export default BlockInfo
