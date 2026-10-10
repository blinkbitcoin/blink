import { GT } from "@/graphql/index"

const AccountProvider = GT.Enum({
  name: "AccountProvider",
  values: {
    BLINK: { value: "blink" },
    SPARK: { value: "spark" },
  },
})

export default AccountProvider
