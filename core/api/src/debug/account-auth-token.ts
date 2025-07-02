/**
 * how to run:
 *
 * pnpm tsx src/debug/account-auth-token.ts <phone>
 *
 * <phone>: phone number.
 */

import { isUp } from "@/services/lnd/health"
import { lndsConnect } from "@/services/lnd/auth"
import { AuthWithPhonePasswordlessService } from "@/services/kratos"
import { setupMongoConnection } from "@/services/mongodb"

const getToken = async ({ phone }: { phone: PhoneNumber }) => {
  const authService = AuthWithPhonePasswordlessService()
  const kratosResult = await authService.loginToken({ phone })
  if (kratosResult instanceof Error) return kratosResult
  return kratosResult.authToken
}

const main = async () => {
  const args = process.argv.slice(-1)
  const params = {
    phone: args[0] as PhoneNumber,
  }
  const result = await getToken(params)
  if (result instanceof Error) {
    console.error("Error:", result)
    return
  }
  console.log(`Auth token for ${params.phone}: `, result)
}

setupMongoConnection()
  .then(async (mongoose) => {
    await Promise.all(lndsConnect.map((lndParams) => isUp(lndParams)))
    await main()
    if (mongoose) await mongoose.connection.close()
  })
  .catch((err) => console.log(err))
