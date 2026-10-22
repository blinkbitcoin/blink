type CaptchaError = import("@/domain/captcha/errors").CaptchaError

type GeetestRegister = {
  success: number
  gt: string
  challenge: string
  newCaptcha: boolean
}

type GeetestType = {
  register: () => Promise<CaptchaError | GeetestRegister>
  validate: (
    challenge: string,
    validate: string,
    seccode: string,
  ) => Promise<true | CaptchaError>
}

// Hand-written for the vendored SDK in lib/gt3-server-node-express-sdk, which
// ships no types of its own. Minimal on purpose — only what services/geetest.ts
// uses. The point of declaring it at all is VALIDATE_REQUEST_FAILED_MSG: with
// the module typed as `any`, dropping that export would silently make the
// sentinel `undefined`, and `result.msg === undefined` would then start
// reclassifying genuine user captcha failures as provider outages.
declare module "@galoy/gt3-server-node-express-sdk" {
  export const VALIDATE_REQUEST_FAILED_MSG: string

  // Mirrors GeetestLibResult in the vendored SDK.
  export type GeetestLibResult = {
    status: number
    data: string
    msg: string
  }

  export class GeetestLib {
    constructor(geetestId: string, geetestKey: string)
    register(digestmod: string, params: Record<string, string>): Promise<GeetestLibResult>
    successValidate(
      challenge: string,
      validate: string,
      seccode: string,
      params: unknown[],
    ): Promise<GeetestLibResult>
  }
}
