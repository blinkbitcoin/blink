import { GT } from "@/graphql/index"

const LnurlSuccessAction = GT.Object({
  name: "LnurlSuccessAction",
  description: "LNURL success action returned after a successful payment (LUD-09)",
  fields: () => ({
    tag: {
      type: GT.NonNull(GT.String),
      description: "Action type: 'message', 'url', or 'aes'",
    },
    message: {
      type: GT.String,
      description: "Message content (for 'message' tag)",
    },
    description: {
      type: GT.String,
      description: "Description text (for 'url' and 'aes' tags)",
    },
    url: {
      type: GT.String,
      description: "URL to open (for 'url' tag)",
    },
    ciphertext: {
      type: GT.String,
      description: "Encrypted content (for 'aes' tag)",
    },
    iv: {
      type: GT.String,
      description: "Initialization vector for decryption (for 'aes' tag)",
    },
  }),
})

export default LnurlSuccessAction
