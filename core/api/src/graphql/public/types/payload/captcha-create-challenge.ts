import { GT } from "@/graphql/index"

import IError from "@/graphql/shared/types/abstract/error"

const CaptchaCreateChallengeResult = GT.Object({
  name: "CaptchaCreateChallengeResult",
  fields: () => ({
    id: {
      type: GT.NonNull(GT.String),
    },
    challengeCode: {
      type: GT.NonNull(GT.String),
    },
    newCaptcha: {
      type: GT.NonNull(GT.Boolean),
    },
    failbackMode: {
      type: GT.NonNull(GT.Boolean),
      deprecationReason:
        "Always false. Registration now fails closed while the captcha provider " +
        "is degraded rather than minting an offline challenge the server would " +
        "later reject, so clients are never asked to enter failback mode.",
    },
  }),
})

const CaptchaCreateChallengePayload = GT.Object({
  name: "CaptchaCreateChallengePayload",
  fields: () => ({
    errors: {
      type: GT.NonNullList(IError),
    },
    result: { type: CaptchaCreateChallengeResult },
  }),
})

export default CaptchaCreateChallengePayload
