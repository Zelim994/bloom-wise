import { describe, expect, it } from "vitest"
import { buildBouquetItemRows, validateBouquetItems } from "./bouquetItems"

describe("validateBouquetItems", () => {
  const valid = { flower_id: "flower-1", quantity: 3, unit_cost: 100 }

  it("accepts a valid item and computes total_cost", () => {
    const result = validateBouquetItems([valid])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.items).toEqual([
      {
        flower_id: "flower-1",
        variety_id: null,
        color_id: null,
        quantity: 3,
        unit_cost: 100,
        total_cost: 300,
      },
    ])
  })

  it("accepts an empty list", () => {
    const result = validateBouquetItems([])
    expect(result).toEqual({ ok: true, items: [] })
  })

  it("rejects a missing flower_id", () => {
    const result = validateBouquetItems([{ ...valid, flower_id: "" }])
    expect(result).toEqual({
      ok: false,
      error: "Не удалось определить flower_id для позиции букета",
    })
  })

  it("rejects a bad item even when a valid one comes first", () => {
    const result = validateBouquetItems([valid, { ...valid, flower_id: "" }])
    expect(result.ok).toBe(false)
  })

  it("rejects quantity of zero", () => {
    const result = validateBouquetItems([{ ...valid, quantity: 0 }])
    expect(result.ok).toBe(false)
  })

  it("rejects negative quantity", () => {
    const result = validateBouquetItems([{ ...valid, quantity: -2 }])
    expect(result.ok).toBe(false)
  })

  it("rejects fractional quantity, which the int column would refuse", () => {
    const result = validateBouquetItems([{ ...valid, quantity: 1.5 }])
    expect(result.ok).toBe(false)
  })

  it("rejects NaN quantity", () => {
    const result = validateBouquetItems([{ ...valid, quantity: Number.NaN }])
    expect(result.ok).toBe(false)
  })

  it("rejects a non-finite unit_cost that would store a null total_cost", () => {
    const result = validateBouquetItems([{ ...valid, unit_cost: Number.NaN }])
    expect(result.ok).toBe(false)
  })

  it("allows a zero unit_cost", () => {
    const result = validateBouquetItems([{ ...valid, unit_cost: 0 }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.items[0].total_cost).toBe(0)
  })

  it("keeps variety_id and color_id when provided", () => {
    const result = validateBouquetItems([
      { ...valid, variety_id: "variety-1", color_id: "color-1" },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.items[0].variety_id).toBe("variety-1")
    expect(result.items[0].color_id).toBe("color-1")
  })

  it("normalizes undefined variety_id and color_id to null", () => {
    const result = validateBouquetItems([{ ...valid, variety_id: undefined, color_id: undefined }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.items[0].variety_id).toBeNull()
    expect(result.items[0].color_id).toBeNull()
  })

  it("passes an explicit null variety_id and color_id through", () => {
    const result = validateBouquetItems([{ ...valid, variety_id: null, color_id: null }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.items[0].variety_id).toBeNull()
    expect(result.items[0].color_id).toBeNull()
  })
})

describe("buildBouquetItemRows", () => {
  it("attaches the bouquet id and keeps product_id null", () => {
    const result = validateBouquetItems([
      { flower_id: "flower-1", quantity: 2, unit_cost: 50, variety_id: "variety-1" },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(buildBouquetItemRows("bouquet-1", result.items)).toEqual([
      {
        bouquet_id: "bouquet-1",
        flower_id: "flower-1",
        variety_id: "variety-1",
        color_id: null,
        product_id: null,
        quantity: 2,
        unit_cost: 50,
        total_cost: 100,
      },
    ])
  })

  it("returns an empty array for no items", () => {
    expect(buildBouquetItemRows("bouquet-1", [])).toEqual([])
  })
})
