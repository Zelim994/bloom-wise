// Regression suite for the shared inventory status rules.
//
// getInventoryStatus is the single source of truth behind both the dashboard
// alerts and /inventory (via getInventoryRows), so a boundary change here
// silently desynchronises the two screens. These tests pin the exact
// comparison operators and the priority order between statuses.
//
// daysOnShelf arrives as a parameter, so no clock is involved and no fake
// timers are needed — the suite is deterministic by construction.

import { describe, expect, it } from "vitest"

import { AGING_DAYS } from "./aging"
import { DEFAULT_LOW_THRESHOLD, getInventoryStatus } from "./status"

describe("getInventoryStatus — no_stock", () => {
  it("reports no_stock at zero", () => {
    expect(getInventoryStatus(0, null, null)).toBe("no_stock")
  })

  it("reports no_stock for negative balances", () => {
    // Guard is `stock <= 0`, so a negative balance is not treated as low.
    expect(getInventoryStatus(-1, null, null)).toBe("no_stock")
  })
})

describe("getInventoryStatus — low threshold", () => {
  it("uses DEFAULT_LOW_THRESHOLD when no min stock is set", () => {
    expect(getInventoryStatus(DEFAULT_LOW_THRESHOLD - 1, null, null)).toBe("low")
  })

  it("treats stock exactly at the threshold as low", () => {
    // Boundary is `stock <= threshold`, so equality counts as low, not ok.
    expect(getInventoryStatus(DEFAULT_LOW_THRESHOLD, null, null)).toBe("low")
  })

  it("treats stock one above the threshold as ok", () => {
    expect(getInventoryStatus(DEFAULT_LOW_THRESHOLD + 1, null, null)).toBe("ok")
  })

  it("prefers an explicit positive min stock over the default", () => {
    // min 10 raises the bar: 10 is low even though it exceeds the default 5.
    expect(getInventoryStatus(10, 10, null)).toBe("low")
    expect(getInventoryStatus(11, 10, null)).toBe("ok")
    // min 2 lowers it: 3 is ok even though it is below the default 5.
    expect(getInventoryStatus(3, 2, null)).toBe("ok")
  })

  it("falls back to the default when min stock is zero, negative or absent", () => {
    // `minStock && minStock > 0` rejects 0, negatives, null and undefined.
    expect(getInventoryStatus(DEFAULT_LOW_THRESHOLD, 0, null)).toBe("low")
    expect(getInventoryStatus(DEFAULT_LOW_THRESHOLD, -3, null)).toBe("low")
    expect(getInventoryStatus(DEFAULT_LOW_THRESHOLD, undefined, null)).toBe("low")
  })
})

describe("getInventoryStatus — aging boundary", () => {
  const HEALTHY = DEFAULT_LOW_THRESHOLD + 10

  it("is not aging just below AGING_DAYS", () => {
    expect(getInventoryStatus(HEALTHY, null, AGING_DAYS - 1)).toBe("ok")
  })

  it("is aging exactly at AGING_DAYS", () => {
    // Boundary is `daysOnShelf >= AGING_DAYS`, so the threshold day itself ages.
    expect(getInventoryStatus(HEALTHY, null, AGING_DAYS)).toBe("aging")
  })

  it("is aging above AGING_DAYS", () => {
    expect(getInventoryStatus(HEALTHY, null, AGING_DAYS + 1)).toBe("aging")
  })

  it("never ages when daysOnShelf is unknown", () => {
    // An explicit null check guards the comparison, so unknown age stays ok.
    expect(getInventoryStatus(HEALTHY, null, null)).toBe("ok")
  })
})

describe("getInventoryStatus — priority between competing statuses", () => {
  it("prefers low over aging", () => {
    // Stock shortage outranks shelf age.
    expect(getInventoryStatus(DEFAULT_LOW_THRESHOLD, null, AGING_DAYS + 5)).toBe(
      "low"
    )
  })

  it("prefers no_stock over both low and aging", () => {
    expect(getInventoryStatus(0, 10, AGING_DAYS + 5)).toBe("no_stock")
  })

  it("returns ok only when stock is sufficient and age is below the cutoff", () => {
    expect(
      getInventoryStatus(DEFAULT_LOW_THRESHOLD + 10, null, AGING_DAYS - 1)
    ).toBe("ok")
  })
})
