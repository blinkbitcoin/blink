export const DORMANCY_MONTHS = 12

// "N calendar months before a date": same day-of-month N months earlier, clamped to that
// month's last day (2026-03-31 minus 1 month is 2026-02-28). Time of day is kept. UTC only.
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

// dormant when the last activity is at or before the cutoff (12 calendar months before asOf)
export const isDormantAt = ({ lastActivityAt, asOf }: IsDormantAtArgs): boolean =>
  lastActivityAt.getTime() <= dormancyCutoffAt(asOf).getTime()
