import { describe, expect, it } from "vitest"
import { buildBouquetItemRows, validateBouquetItems, validateBouquetPayload } from "./bouquetItems"

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

// Storage-domain boundaries. Every value here is a known answer measured against
// PostgreSQL in CORE-READY-G1-A, not a value derived from the implementation's
// own constants — so a change to those constants fails these tests instead of
// silently moving the boundary with them.
//
//   numeric(10,2): 99999999.994 accepted (stored 99999999.99)
//                  99999999.995 rejected (rounds to 100000000.00, SQLSTATE 22003)
//   numeric(5,2):  999.994 accepted, 999.995 rejected
//   integer:       max 2147483647
// Both boundaries are symmetric for negative values.
describe("validateBouquetItems storage ranges", () => {
  const item = (over: Partial<{ quantity: number; unit_cost: number }>) => ({
    flower_id: "flower-1", quantity: 1, unit_cost: 1, ...over,
  })
  const ok = (over: Partial<{ quantity: number; unit_cost: number }>) =>
    validateBouquetItems([item(over)]).ok

  describe("quantity", () => {
    it.each([1, 2_147_483_647])("accepts %p", (quantity) => {
      expect(ok({ quantity, unit_cost: 0 })).toBe(true)
    })
    it.each([0, -1, 1.5, 2_147_483_648, Number.NaN, Number.POSITIVE_INFINITY])(
      "rejects %p", (quantity) => {
        const result = validateBouquetItems([item({ quantity, unit_cost: 0 })])
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.error).toContain("Количество")
      },
    )
  })

  describe("unit_cost", () => {
    it.each([100, 0, -100, 99_999_999.99, 99_999_999.994, -99_999_999.994])(
      "accepts %p", (unit_cost) => {
        expect(ok({ unit_cost })).toBe(true)
      },
    )
    it.each([99_999_999.995, -99_999_999.995, 1e30, -1e30])(
      "rejects %p as out of range", (unit_cost) => {
        const result = validateBouquetItems([item({ unit_cost })])
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.error).toBe("Себестоимость позиции букета вне допустимого диапазона")
      },
    )
    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
      "rejects %p as non-finite", (unit_cost) => {
        const result = validateBouquetItems([item({ unit_cost })])
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.error).toBe("Некорректная себестоимость в позиции букета")
      },
    )
  })

  describe("quantity x unit_cost", () => {
    it("accepts a product at the storage limit", () => {
      const result = validateBouquetItems([item({ quantity: 3, unit_cost: 33_333_333.33 })])
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.items[0].total_cost).toBe(99_999_999.99)
    })

    // Both factors are individually valid; only the product is not.
    it.each([
      [2, 99_999_999.99],
      [21_474_836, 4.66],
    ])("rejects %p x %p", (quantity, unit_cost) => {
      const result = validateBouquetItems([item({ quantity, unit_cost })])
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toContain("Сумма позиции букета")
    })
  })
})

describe("validateBouquetPayload", () => {
  const header = { cost_price: 100, sale_price: 200, profit: 100, margin_percent: 50 }
  const items = [{ flower_id: "flower-1", quantity: 1, unit_cost: 1 }]
  const run = (over: Partial<typeof header>) => validateBouquetPayload({ ...header, ...over }, items)

  it("accepts a valid payload and returns the normalized items", () => {
    const result = run({})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.items).toHaveLength(1)
    expect(result.items[0].total_cost).toBe(1)
  })

  // A sale below cost is legitimate; G1 is a range stage, not a pricing policy.
  it.each([
    { profit: -100 },
    { margin_percent: -50 },
    { margin_percent: -999.994 },
    { cost_price: 99_999_999.994 },
    { sale_price: 99_999_999.994 },
    { profit: 99_999_999.994 },
    { margin_percent: 999.994 },
  ])("accepts %p", (over) => {
    expect(run(over).ok).toBe(true)
  })

  it.each([
    [{ cost_price: 99_999_999.995 }, "Себестоимость букета вне допустимого диапазона"],
    [{ sale_price: 99_999_999.995 }, "Цена букета вне допустимого диапазона"],
    [{ profit: 99_999_999.995 }, "Прибыль букета вне допустимого диапазона"],
    [{ profit: -99_999_999.995 }, "Прибыль букета вне допустимого диапазона"],
    [{ margin_percent: 999.995 }, "Маржа букета вне допустимого диапазона"],
    [{ margin_percent: -999.995 }, "Маржа букета вне допустимого диапазона"],
    [{ margin_percent: 1000 }, "Маржа букета вне допустимого диапазона"],
  ] as const)("rejects %p with a field-specific message", (over, error) => {
    const result = run(over)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe(error)
  })

  it.each([
    { cost_price: Number.NaN },
    { sale_price: Number.POSITIVE_INFINITY },
    { profit: Number.NEGATIVE_INFINITY },
    { margin_percent: Number.NaN },
  ])("rejects non-finite %p", (over) => {
    const result = run(over)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe("Некорректное числовое значение букета")
  })

  it("still reports item errors after the header passes", () => {
    const result = validateBouquetPayload(header, [
      { flower_id: "flower-1", quantity: 2, unit_cost: 99_999_999.99 },
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("Сумма позиции букета")
  })

  it("accepts an empty item list, as updateOrder relies on", () => {
    const result = validateBouquetPayload(header, [])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.items).toEqual([])
  })
})
