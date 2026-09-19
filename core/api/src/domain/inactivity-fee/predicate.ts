export const DORMANCY_MONTHS = 12

// clamped to the target month's last day (Mar 31 minus 1 month is Feb 28); UTC
export const calendarMonthsBefore = ({
  date,
  months,
}: CalendarMonthsBeforeArgs): Date => {
  const targetMonthIndex = date.getUTCMonth() - months
  const lastDayOfTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), targetMonthIndex + 1, 0),
  ).getUTCDate()
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      targetMonthIndex,
      Math.min(date.getUTCDate(), lastDayOfTargetMonth),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  )
}

export const dormancyCutoffAt = (asOf: Date): Date =>
  calendarMonthsBefore({ date: asOf, months: DORMANCY_MONTHS })

export const isDormantAt = ({ lastActivityAt, asOf }: IsDormantAtArgs): boolean =>
  lastActivityAt.getTime() <= dormancyCutoffAt(asOf).getTime()
