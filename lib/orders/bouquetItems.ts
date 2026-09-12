// Deterministic validation and row-building for the items of an order's
// bouquet.
//
// Why this is a separate pure module: it is the last place a bad payload can be
// rejected in the application's own words. Order mutations now persist a
// bouquet through the replace_order_bouquet RPC, so the delete-then-insert is a
// single transaction and no longer leaves a half-replaced bouquet behind — but
// that RPC reports failures in messages meant for the database boundary, not
// for the florist. Validating here keeps the common mistakes answerable with a
// precise user-facing message instead of a generic one.
//
// It validates only invariants the database already enforces today — column
// types, their storage ranges, and `bouquet_items.quantity int not null check
// (quantity > 0)` — plus flower_id, which every downstream stock path keys off.
// No new business rules: in particular no sign restriction, because a negative
// profit or margin is legitimate and the columns carry no CHECK against it.
//
// Layer contract: these checks are UX and fast feedback. The authoritative
// domain guard lives in replace_order_bouquet, which validates the same ranges
// in numeric arithmetic before it mutates anything. An automated caller that
// never reaches this module is still protected there.

// Storage domains of the columns these values are written to, measured against
// PostgreSQL rather than assumed (CORE-READY-G1-A):
//
//   bouquet_items.quantity                              integer  -> 1 .. 2147483647
//   bouquet_items.unit_cost / total_cost                numeric(10,2)
//   bouquets.cost_price / sale_price / profit           numeric(10,2)
//   orders.cost_price                                   numeric(10,2)
//   bouquets.margin_percent                             numeric(5,2)
//
// PostgreSQL rounds to the column scale FIRST and only then checks precision,
// so numeric(10,2) accepts 99999999.994 (stored as 99999999.99) and rejects
// 99999999.995 (rounds to 100000000.00 -> SQLSTATE 22003). The boundary is
// therefore an EXCLUSIVE magnitude, and it is symmetric for negatives.
//
// These thresholds are used directly rather than reimplementing PostgreSQL's
// rounding in JavaScript: Math.round breaks ties toward +Infinity while
// PostgreSQL rounds away from zero, and IEEE-754 cannot reproduce numeric
// arithmetic exactly. A JS mirror would be a convincing-looking lie. This layer
// answers "obviously out of range" fast; the RPC answers authoritatively.
const INT4_MAX = 2_147_483_647
const NUMERIC_10_2_ABS_EXCLUSIVE_LIMIT = 99_999_999.995
const NUMERIC_5_2_ABS_EXCLUSIVE_LIMIT = 999.995

/** True when `value` is a finite number that numeric(10,2) can store. */
function fitsMoney(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) < NUMERIC_10_2_ABS_EXCLUSIVE_LIMIT
}

export type BouquetItemInput = {
  flower_id: string
  quantity: number
  unit_cost: number
  variety_id?: string | null
  color_id?: string | null
}

/** One item, normalized to exactly the shape bouquet_items stores. */
export type NormalizedBouquetItem = {
  flower_id: string
  variety_id: string | null
  color_id: string | null
  quantity: number
  unit_cost: number
  total_cost: number
}

export type BouquetItemsValidation =
  | { ok: true; items: NormalizedBouquetItem[] }
  | { ok: false; error: string }

/**
 * Validates every item and normalizes it. Returns a user-safe Russian message
 * instead of throwing, so a bad payload is reported through the action's
 * ordinary `{ error }` channel rather than as an uncaught Server Action throw.
 */
export function validateBouquetItems(items: BouquetItemInput[]): BouquetItemsValidation {
  const normalized: NormalizedBouquetItem[] = []

  for (const item of items) {
    if (!item.flower_id) {
      return { ok: false, error: "Не удалось определить flower_id для позиции букета" }
    }
    // Mirrors `quantity int not null check (quantity > 0)` plus the int4 upper
    // bound: a fractional, non-finite or oversized value is rejected by the
    // column, not by us. Number.isInteger already excludes NaN and +-Infinity.
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > INT4_MAX
    ) {
      return {
        ok: false,
        error: "Количество в позиции букета должно быть целым числом от 1 до 2 147 483 647",
      }
    }
    // A non-finite unit_cost would serialize to null and silently store a null
    // total_cost, corrupting the order's cost figures.
    if (!Number.isFinite(item.unit_cost)) {
      return { ok: false, error: "Некорректная себестоимость в позиции букета" }
    }
    if (!fitsMoney(item.unit_cost)) {
      return { ok: false, error: "Себестоимость позиции букета вне допустимого диапазона" }
    }

    // total_cost is stored in its own numeric(10,2) column, so two individually
    // valid factors can still produce an unstorable product — the case that used
    // to surface as a raw overflow after the old items had already been deleted.
    const totalCost = item.quantity * item.unit_cost
    if (!fitsMoney(totalCost)) {
      return {
        ok: false,
        error: "Сумма позиции букета превышает допустимый диапазон — уменьшите количество или себестоимость",
      }
    }

    normalized.push({
      flower_id: item.flower_id,
      variety_id: item.variety_id ?? null,
      color_id: item.color_id ?? null,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      total_cost: totalCost,
    })
  }

  return { ok: true, items: normalized }
}

/** The bouquet header fields that are persisted alongside the items. */
export type BouquetHeaderInput = {
  cost_price: number
  sale_price: number
  profit: number
  margin_percent: number
}

/** Same discriminated shape as validateBouquetItems, so callers are unchanged. */
export type BouquetPayloadValidation = BouquetItemsValidation

/**
 * Validates a whole bouquet before it is persisted: the four header numbers
 * first, then every item.
 *
 * The header is checked here and not inside the actions because all four values
 * land in numeric columns (three in numeric(10,2), margin_percent in the much
 * tighter numeric(5,2)) and none of them was range-checked anywhere before.
 *
 * Callers must only invoke this for a bouquet that will actually be written.
 * createOrder deliberately does not: a bouquet with no items is never
 * persisted there, so rejecting its unused header would change behaviour.
 */
export function validateBouquetPayload(
  header: BouquetHeaderInput,
  items: BouquetItemInput[],
): BouquetPayloadValidation {
  const money: Array<[number, string]> = [
    [header.cost_price, "Себестоимость букета вне допустимого диапазона"],
    [header.sale_price, "Цена букета вне допустимого диапазона"],
    [header.profit, "Прибыль букета вне допустимого диапазона"],
  ]
  for (const [value, rangeError] of money) {
    if (!Number.isFinite(value)) {
      return { ok: false, error: "Некорректное числовое значение букета" }
    }
    if (!fitsMoney(value)) return { ok: false, error: rangeError }
  }

  if (!Number.isFinite(header.margin_percent)) {
    return { ok: false, error: "Некорректное числовое значение букета" }
  }
  if (Math.abs(header.margin_percent) >= NUMERIC_5_2_ABS_EXCLUSIVE_LIMIT) {
    return { ok: false, error: "Маржа букета вне допустимого диапазона" }
  }

  return validateBouquetItems(items)
}

/**
 * Attaches the bouquet id to already-validated items.
 *
 * No production caller since order mutations moved to replace_order_bouquet,
 * which builds these rows itself inside the transaction. Retained (and still
 * covered by tests) rather than deleted as an unrelated change.
 */
export function buildBouquetItemRows(bouquetId: string, items: NormalizedBouquetItem[]) {
  return items.map((item) => ({
    bouquet_id: bouquetId,
    flower_id: item.flower_id,
    variety_id: item.variety_id,
    color_id: item.color_id,
    product_id: null,
    quantity: item.quantity,
    unit_cost: item.unit_cost,
    total_cost: item.total_cost,
  }))
}
