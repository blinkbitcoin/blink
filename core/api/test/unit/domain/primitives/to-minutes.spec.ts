import { toMinutes } from "@/domain/primitives"

describe("toMinutes", () => {
  it.each([0, 1, 15, 1440])("keeps %d minutes as its value", (minutes) => {
    expect(toMinutes(minutes)).toEqual(minutes)
  })
})
