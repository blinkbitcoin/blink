type CaptchaError = import("@/domain/captcha/errors").CaptchaError
type UnknownCaptchaError = import("@/domain/captcha/errors").UnknownCaptchaError

type GeetestRegister = {
  success: number
  gt: string
  challenge: string
  newCaptcha: boolean
}

type GeetestType = {
  register: () => Promise<UnknownCaptchaError | GeetestRegister>
  validate: (
    challenge: string,
    validate: string,
    seccode: string,
  ) => Promise<true | CaptchaError>
}

type GeetestV4Register = {
  captchaId: string
  challenge: string
  riskType: string
}

type GeetestV4Type = {
  register: (
    userId?: string,
    clientType?: string,
    ipAddress?: string,
  ) => Promise<UnknownCaptchaError | GeetestV4Register>
  validate: (
    lotNumber: string,
    captchaOutput: string,
    passToken: string,
    genTime: string,
    userId?: string,
  ) => Promise<true | CaptchaError>
}

declare module "@galoy/gt3-server-node-express-sdk"
declare module "gt4-node-sdk"
