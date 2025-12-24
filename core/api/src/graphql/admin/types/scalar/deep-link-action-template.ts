import { GT } from "@/graphql/index"

const DeepLinkActionTemplate = GT.Enum({
  name: "DeepLinkActionTemplate",
  values: {
    SET_LN_ADDRESS_MODAL: {
      value: "SET_LN_ADDRESS_MODAL",
    },
    SET_DEFAULT_ACCOUNT_MODAL: {
      value: "SET_DEFAULT_ACCOUNT_MODAL",
    },
    UPGRADE_ACCOUNT_MODAL: {
      value: "UPGRADE_ACCOUNT_MODAL",
    },
  },
})

export default DeepLinkActionTemplate
