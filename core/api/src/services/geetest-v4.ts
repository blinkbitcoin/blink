// Geetest v4 implementation
// Based on https://docs.geetest.com/captcha/deploy/server/node

import { GeetestLib } from "gt4-node-sdk"

import { addEventToCurrentSpan, recordExceptionInCurrentSpan } from "./tracing"

import { CaptchaUserFailToPassError, UnknownCaptchaError } from "@/domain/captcha/errors"

const GeetestV4 = (config: { id: string; key: string }): GeetestV4Type => {
  const register = async (
    userId?: string,
    clientType: string = "web",
    _ipAddress?: string, // Reserved for future IP-based risk assessment
  ): Promise<UnknownCaptchaError | GeetestV4Register> => {
    try {
      const gtLib = new GeetestLib(config.id, config.key)

      // Simple registration for initial implementation (IP optional)
      const result = await gtLib.register({
        user_id: userId || "anonymous",
        client_type: clientType,
        // ip_address: ipAddress, // Commented out for initial implementation
      })

      const geetestV4Register: GeetestV4Register = {
        captchaId: result.captcha_id,
        challenge: result.challenge,
        riskType: result.risk_type,
      }
      
      addEventToCurrentSpan("geetestV4RegisterSuccess")
      return geetestV4Register
    } catch (error) {
      recordExceptionInCurrentSpan({ error, fallbackMsg: "geetestV4RegisterError" })
      return new UnknownCaptchaError(error)
    }
  }

  const validate = async (
    lotNumber: string,
    captchaOutput: string,
    passToken: string,
    genTime: string,
    userId?: string,
  ): Promise<true | CaptchaError> => {
    try {
      const gtLib = new GeetestLib(config.id, config.key)
      
      const result = await gtLib.validate({
        lot_number: lotNumber,
        captcha_output: captchaOutput,
        pass_token: passToken,
        gen_time: genTime,
        user_id: userId || "anonymous",
      })
      
      if (result.result !== "success") {
        return new CaptchaUserFailToPassError()
      }
      
      addEventToCurrentSpan("geetestV4ValidateSuccess")
      return true
    } catch (err) {
      recordExceptionInCurrentSpan({ error: err, fallbackMsg: "geetestV4ValidateError" })
      return new UnknownCaptchaError(err)
    }
  }

  return { register, validate }
}

export default GeetestV4
