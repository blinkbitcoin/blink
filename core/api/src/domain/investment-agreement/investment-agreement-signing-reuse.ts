const MS_PER_MINUTE = (60 * 1000) as MilliSeconds

export const investmentAgreementSigningReuseUntil = ({
  createdAt,
  signingReuseWindowMinutes,
}: {
  createdAt: Date
  signingReuseWindowMinutes: Minutes
}): Date => new Date(createdAt.getTime() + signingReuseWindowMinutes * MS_PER_MINUTE)
