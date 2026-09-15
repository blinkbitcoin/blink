import { redis } from "./connection"

import { defaultTimeToExpiryInSeconds } from "@/domain/bitcoin/lightning/invoice-expiration"
import { CouldNotFindError, UnknownRepositoryError } from "@/domain/errors"

const keyFor = (paymentHash: PaymentHash) => `lnAddressVerify:${paymentHash}`

export const LnAddressVerifyCache = (): ILnAddressVerifyCache => {
  const store = async ({
    paymentHash,
    verify,
  }: {
    paymentHash: PaymentHash
    verify: string
  }): Promise<true | RepositoryError> => {
    try {
      await redis.set(keyFor(paymentHash), verify, "EX", defaultTimeToExpiryInSeconds)
      return true
    } catch (err) {
      return new UnknownRepositoryError(err)
    }
  }

  const findByPaymentHash = async (
    paymentHash: PaymentHash,
  ): Promise<string | RepositoryError> => {
    try {
      const verify = await redis.get(keyFor(paymentHash))
      if (!verify) {
        return new CouldNotFindError("Couldn't find verify url for payment hash")
      }
      return verify
    } catch (err) {
      return new UnknownRepositoryError(err)
    }
  }

  return {
    store,
    findByPaymentHash,
  }
}
