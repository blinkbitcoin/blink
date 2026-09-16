import { toHours } from "@/domain/primitives"

describe("toHours", () => {
  it.each([0, 1, 24, 168])("keeps %d hours as its value", (hours) => {
    expect(toHours(hours)).toEqual(hours)
  })
})
