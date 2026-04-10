import {
  BigIntFloatConversionError,
  BigIntToNumberConversionError,
  UnknownBigIntConversionError,
} from "./errors"

export const safeBigInt = (num: number | string): bigint | BigIntConversionError => {
  try {
    return BigInt(num)
  } catch (err) {
    if (err instanceof RangeError) {
      return new BigIntFloatConversionError(`${num}`)
    }
    return new UnknownBigIntConversionError(err)
  }
}

export const roundToBigInt = (num: number): bigint => {
  return BigInt(Math.round(num))
}

export const safeIntFromBigInt = (
  value: bigint,
): number | BigIntToNumberConversionError => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    return new BigIntToNumberConversionError(
      `BigInt value ${value} exceeds Number.MAX_SAFE_INTEGER and cannot be safely converted to number`,
    )
  }
  if (value < BigInt(Number.MIN_SAFE_INTEGER)) {
    return new BigIntToNumberConversionError(
      `BigInt value ${value} is below Number.MIN_SAFE_INTEGER and cannot be safely converted to number`,
    )
  }
  return Number(value)
}
