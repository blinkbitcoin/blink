import { BtcPaymentAmount, AmountCalculator } from "@/domain/shared"

const calc = AmountCalculator()

export const PercentageFeeStrategy = (
  config: PercentageFeeStrategyParams,
): IFeeStrategy => {
  const calculate = ({
    paymentAmount,
  }: FeeCalculationArgs): BtcPaymentAmount | ValidationError => {
    return calc.mulBasisPoints(paymentAmount, BigInt(config.basisPoints))
  }

  return {
    calculate,
  }
}
