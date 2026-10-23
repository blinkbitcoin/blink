// mutations that need a fresh authenticator code when the identity has TOTP
export const TOTP_STEP_UP_MUTATIONS = [
  "userTotpDelete",
  "userEmailDelete",
  "userEmailRegistrationInitiate",
  "userPhoneDelete",
  "userPhoneRegistrationValidate",
] as const
