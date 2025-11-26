import { BtcPaymentAmount, AmountCalculator } from "@/domain/shared"

const calc = AmountCalculator()

export const PercentageFeeStrategy = (
  config: PercentageFeeStrategyParams,
): IFeeStrategy => {
  const calculate = async ({
    paymentAmount,
  }: FeeCalculationArgs): Promise<BtcPaymentAmount | ValidationError> => {
    return calc.mulBasisPoints(paymentAmount, BigInt(config.basisPoints))
  }

  return {
    calculate,
  }
}
