import { forEachConcurrent } from "@/utils"

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

const deferred = <T = void>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// lets every pending promise chain run to its next real wait; no wall-clock involved
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve))
}

// the run's error, or undefined; attached up front so a rejection is never unhandled
const settled = (run: Promise<void>) =>
  run.then(
    () => undefined,
    (error: Error) => error,
  )

async function* from<T>(values: T[], { throwAfter }: { throwAfter?: number } = {}) {
  let pulled = 0
  for (const value of values) {
    if (throwAfter !== undefined && pulled === throwAfter) throw new Error("cursor died")
    pulled += 1
    yield value
  }
  if (throwAfter !== undefined && pulled === throwAfter) throw new Error("cursor died")
}

// each item's processing waits on a gate the test opens, in the order it chooses
const gated = () => {
  const gates = new Map<number, Deferred<void>>()
  const gate = (item: number) => {
    let found = gates.get(item)
    if (found === undefined) {
      found = deferred()
      gates.set(item, found)
    }
    return found
  }
  let active = 0
  const state = { maxActive: 0, started: [] as number[] }
  const processItem = async (item: number) => {
    state.started.push(item)
    active += 1
    state.maxActive = Math.max(state.maxActive, active)
    try {
      await gate(item).promise
    } finally {
      active -= 1
    }
    return item * 10
  }
  const release = async (...items: number[]) => {
    for (const item of items) {
      gate(item).resolve()
      await flush()
    }
  }
  const failItem = async (item: number, error: Error) => {
    gate(item).reject(error)
    await flush()
  }
  return { state, processItem, release, failItem }
}

const byValue = (a: number, b: number) => a - b

describe("forEachConcurrent", () => {
  it("processes every item once with at most `concurrency` in flight, delivering in completion order", async () => {
    const items = [...Array(10).keys()]
    const { state, processItem, release } = gated()
    const results: number[] = []

    const run = forEachConcurrent({
      items: from(items),
      concurrency: 4,
      process: processItem,
      onResult: (result) => {
        results.push(result)
      },
    })
    await flush()
    expect(state.started).toEqual([0, 1, 2, 3])

    await release(3, 1)
    expect(results).toEqual([30, 10])
    expect(state.started).toEqual([0, 1, 2, 3, 4, 5])

    await release(...[...items].reverse())
    await run

    expect(state.maxActive).toBe(4)
    expect([...state.started].sort(byValue)).toEqual(items)
    expect([...results].sort(byValue)).toEqual(items.map((item) => item * 10))
  })

  it("never overlaps two onResult calls, even when they are slow", async () => {
    const { processItem, release } = gated()
    const sinkGates = new Map<number, Deferred<void>>()
    const entered: number[] = []
    let delivering = 0
    let overlapped = false

    const run = forEachConcurrent({
      items: from([0, 1, 2, 3, 4, 5]),
      concurrency: 4,
      process: processItem,
      onResult: async (_result, item) => {
        delivering += 1
        if (delivering > 1) overlapped = true
        entered.push(item)
        const sinkGate = deferred()
        sinkGates.set(item, sinkGate)
        await sinkGate.promise
        delivering -= 1
      },
    })
    await release(0, 1, 2, 3, 4, 5)
    expect(entered).toHaveLength(1)

    while (entered.length < 6 || delivering > 0) {
      sinkGates.get(entered[entered.length - 1])?.resolve()
      await flush()
    }
    await run

    expect(overlapped).toBe(false)
    expect([...entered].sort(byValue)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it("keeps the iteration order at concurrency 1, even when a later item is ready first", async () => {
    const { state, processItem, release } = gated()
    const delivered: number[] = []

    const run = forEachConcurrent({
      items: from([0, 1, 2, 3]),
      concurrency: 1,
      process: processItem,
      onResult: (_result, item) => {
        delivered.push(item)
      },
    })
    await release(2, 1)
    expect(state.started).toEqual([0])
    expect(delivered).toEqual([])

    await release(0)
    expect(delivered).toEqual([0, 1, 2])
    await release(3)
    await run

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
    const { state, processItem, release } = gated()
    const delivered: number[] = []

    const run = settled(
      forEachConcurrent({
        items: from([0, 1, 2, 3], { throwAfter: 2 }),
        concurrency: 4,
        process: processItem,
        onResult: (_result, item) => {
          delivered.push(item)
        },
      }),
    )
    await flush()
    expect(state.started).toEqual([0, 1])
    await release(1, 0)

    expect((await run)?.message).toBe("cursor died")
    expect(state.started).toEqual([0, 1])
    expect(delivered).toEqual([1, 0])
  })

  it("on an onResult error, starts nothing more, still delivers in-flight items, then rethrows the first error", async () => {
    const { state, processItem, release } = gated()
    const delivered: number[] = []

    const run = settled(
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
    )
    await flush()
    await release(0, 2, 1)

    expect((await run)?.message).toBe("sink full")
    expect(state.started).toEqual([0, 1, 2])
    expect(delivered).toEqual([0, 2, 1])
  })

  it("on a process error, starts nothing more, drains, then rethrows", async () => {
    const { state, processItem, release, failItem } = gated()
    const delivered: number[] = []

    const run = settled(
      forEachConcurrent({
        items: from([0, 1, 2, 3]),
        concurrency: 2,
        process: processItem,
        onResult: (_result, item) => {
          delivered.push(item)
        },
      }),
    )
    await flush()
    await failItem(0, new Error("boom"))
    await release(1)

    expect((await run)?.message).toBe("boom")
    expect(state.started).toEqual([0, 1])
    expect(delivered).toEqual([1])
  })

  it("stops starting once shouldStop is true and drains what is in flight", async () => {
    let stop = false
    const { state, processItem, release } = gated()
    const delivered: number[] = []

    const run = forEachConcurrent({
      items: from([0, 1, 2, 3, 4, 5]),
      concurrency: 3,
      shouldStop: () => stop,
      process: processItem,
      onResult: (_result, item) => {
        delivered.push(item)
        if (item === 1) stop = true
      },
    })
    await flush()
    await release(1, 0, 2)
    await run

    expect(state.started).toEqual([0, 1, 2])
    expect(delivered).toEqual([1, 0, 2])
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

    expect(closed).toHaveBeenCalledTimes(1)
  })

  it("closes the iterator and rethrows when shouldStop throws", async () => {
    const closed = jest.fn()
    async function* items() {
      try {
        for (const item of [0, 1, 2, 3]) yield item
      } finally {
        closed()
      }
    }
    let calls = 0
    const processItem = jest.fn(async (item: number) => item)

    const run = settled(
      forEachConcurrent({
        items: items(),
        concurrency: 1,
        shouldStop: () => {
          calls += 1
          if (calls > 1) throw new Error("stop check broke")
          return false
        },
        process: processItem,
        onResult: () => undefined,
      }),
    )

    expect((await run)?.message).toBe("stop check broke")
    expect(closed).toHaveBeenCalledTimes(1)
    expect(processItem).not.toHaveBeenCalled()
  })

  it.each([0, -3, NaN, Infinity, undefined as unknown as number])(
    "treats a concurrency of %p as 1",
    async (concurrency) => {
      const { state, processItem, release } = gated()

      const run = forEachConcurrent({
        items: from([0, 1, 2]),
        concurrency,
        process: processItem,
        onResult: () => undefined,
      })
      await flush()
      expect(state.started).toEqual([0])
      await release(0, 1, 2)
      await run

      expect(state.maxActive).toBe(1)
      expect(state.started).toEqual([0, 1, 2])
    },
  )
})
