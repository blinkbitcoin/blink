import { forEachConcurrent } from "@/utils"

const tick = () => new Promise((resolve) => setImmediate(resolve))

async function* from<T>(values: T[], { throwAfter }: { throwAfter?: number } = {}) {
  let pulled = 0
  for (const value of values) {
    if (throwAfter !== undefined && pulled === throwAfter) throw new Error("cursor died")
    pulled += 1
    yield value
  }
  if (throwAfter !== undefined && pulled === throwAfter) throw new Error("cursor died")
}

// processes each item after a per-item delay, tracking how many run at once
const tracked = (delays: Record<number, number> = {}) => {
  let active = 0
  const state = { maxActive: 0, started: [] as number[] }
  const processItem = async (item: number) => {
    state.started.push(item)
    active += 1
    state.maxActive = Math.max(state.maxActive, active)
    await new Promise((resolve) => setTimeout(resolve, delays[item] ?? 1))
    active -= 1
    return item * 10
  }
  return { state, processItem }
}

describe("forEachConcurrent", () => {
  it("processes every item once with at most `concurrency` in flight", async () => {
    const items = [...Array(10).keys()]
    const { state, processItem } = tracked({ 0: 5, 3: 8, 7: 2 })
    const results: number[] = []

    await forEachConcurrent({
      items: from(items),
      concurrency: 4,
      process: processItem,
      onResult: (result) => {
        results.push(result)
      },
    })

    expect(state.maxActive).toBe(4)
    expect([...state.started].sort((a, b) => a - b)).toEqual(items)
    expect([...results].sort((a, b) => a - b)).toEqual(items.map((item) => item * 10))
  })

  it("never overlaps two onResult calls, even when they are slow", async () => {
    const { processItem } = tracked({ 0: 4, 1: 1, 2: 3, 3: 1, 4: 2, 5: 1 })
    let delivering = 0
    let overlapped = false
    const delivered: number[] = []

    await forEachConcurrent({
      items: from([0, 1, 2, 3, 4, 5]),
      concurrency: 4,
      process: processItem,
      onResult: async (_result, item) => {
        delivering += 1
        if (delivering > 1) overlapped = true
        await new Promise((resolve) => setTimeout(resolve, 3))
        delivered.push(item)
        delivering -= 1
      },
    })

    expect(overlapped).toBe(false)
    expect(delivered).toHaveLength(6)
  })

  it("keeps the iteration order at concurrency 1", async () => {
    const { state, processItem } = tracked({ 0: 5, 1: 1, 2: 3 })
    const delivered: number[] = []

    await forEachConcurrent({
      items: from([0, 1, 2, 3]),
      concurrency: 1,
      process: processItem,
      onResult: (_result, item) => {
        delivered.push(item)
      },
    })

    expect(state.maxActive).toBe(1)
    expect(delivered).toEqual([0, 1, 2, 3])
  })

  it("at concurrency 1, pulls the next item only after the previous one is delivered", async () => {
    const events: string[] = []
    async function* items() {
      for (const item of [0, 1]) {
        events.push(`pull ${item}`)
        yield item
      }
    }

    await forEachConcurrent({
      items: items(),
      concurrency: 1,
      process: async (item) => {
        events.push(`process ${item}`)
        return item
      },
      onResult: (item) => {
        events.push(`deliver ${item}`)
      },
    })

    expect(events).toEqual([
      "pull 0",
      "process 0",
      "deliver 0",
      "pull 1",
      "process 1",
      "deliver 1",
    ])
  })

  it("on an iterator error, starts nothing more, drains in-flight items, then rethrows", async () => {
    const { state, processItem } = tracked({ 0: 5, 1: 5 })
    const delivered: number[] = []

    await expect(
      forEachConcurrent({
        items: from([0, 1, 2, 3], { throwAfter: 2 }),
        concurrency: 4,
        process: processItem,
        onResult: (_result, item) => {
          delivered.push(item)
        },
      }),
    ).rejects.toThrow("cursor died")

    expect(state.started).toEqual([0, 1])
    expect([...delivered].sort()).toEqual([0, 1])
  })

  it("on an onResult error, starts nothing more, still delivers in-flight items, then rethrows the first error", async () => {
    const { state, processItem } = tracked({ 0: 1, 1: 5, 2: 5 })
    const delivered: number[] = []

    await expect(
      forEachConcurrent({
        items: from([0, 1, 2, 3, 4, 5]),
        concurrency: 3,
        process: processItem,
        onResult: (_result, item) => {
          delivered.push(item)
          if (item === 0) throw new Error("sink full")
          if (item === 1) throw new Error("second failure")
        },
      }),
    ).rejects.toThrow("sink full")

    expect(state.started).toEqual([0, 1, 2])
    expect(delivered).toEqual([0, 1, 2])
  })

  it("on a process error, starts nothing more, drains, then rethrows", async () => {
    const delivered: number[] = []

    await expect(
      forEachConcurrent({
        items: from([0, 1, 2, 3]),
        concurrency: 2,
        process: async (item) => {
          await new Promise((resolve) => setTimeout(resolve, item === 0 ? 1 : 5))
          if (item === 0) throw new Error("boom")
          return item
        },
        onResult: (item) => {
          delivered.push(item)
        },
      }),
    ).rejects.toThrow("boom")

    expect(delivered).toEqual([1])
  })

  it("stops starting once shouldStop is true and drains what is in flight", async () => {
    let stop = false
    const { state, processItem } = tracked({ 0: 5, 1: 2, 2: 5 })
    const delivered: number[] = []

    await forEachConcurrent({
      items: from([0, 1, 2, 3, 4, 5]),
      concurrency: 3,
      shouldStop: () => stop,
      process: processItem,
      onResult: (_result, item) => {
        delivered.push(item)
        if (item === 1) stop = true
      },
    })

    expect(state.started).toEqual([0, 1, 2])
    expect([...delivered].sort()).toEqual([0, 1, 2])
  })

  it("closes the iterator when it stops early", async () => {
    const closed = jest.fn()
    async function* items() {
      try {
        for (const item of [0, 1, 2, 3]) yield item
      } finally {
        closed()
      }
    }
    let stop = false

    await forEachConcurrent({
      items: items(),
      concurrency: 1,
      shouldStop: () => stop,
      process: async (item) => {
        stop = true
        return item
      },
      onResult: () => undefined,
    })
    await tick()

    expect(closed).toHaveBeenCalledTimes(1)
  })

  it("treats a concurrency below 1 as 1", async () => {
    const { state, processItem } = tracked()

    await forEachConcurrent({
      items: from([0, 1, 2]),
      concurrency: 0,
      process: processItem,
      onResult: () => undefined,
    })

    expect(state.maxActive).toBe(1)
    expect(state.started).toEqual([0, 1, 2])
  })
})
