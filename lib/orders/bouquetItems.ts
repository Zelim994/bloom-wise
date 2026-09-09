// Deterministic validation and row-building for the items of an order's
// bouquet.
//
// Why this is a separate pure module: replacing an existing bouquet is a
// delete-then-insert across two separate PostgREST requests, i.e. two separate
// transactions. Anything that can reject the payload must therefore run BEFORE
// the delete — once the old items are gone there is nothing left to roll back
// to. Previously the flower_id check lived inside the row-mapping loop and
// threw *after* the delete had already committed.
//
// It validates only invariants the database already enforces today
// (bouquet_items.quantity is `int not null check (quantity > 0)`, flower_id is
// what every downstream stock path keys off) — no new business rules.

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
    // Mirrors `quantity int not null check (quantity > 0)`: a fractional or
    // non-finite value is rejected by the column, not by us.
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return { ok: false, error: "Количество в позиции букета должно быть целым числом больше 0" }
    }
    // A non-finite unit_cost would serialize to null and silently store a null
    // total_cost, corrupting the order's cost figures.
    if (!Number.isFinite(item.unit_cost)) {
      return { ok: false, error: "Некорректная себестоимость в позиции букета" }
    }

    normalized.push({
      flower_id: item.flower_id,
      variety_id: item.variety_id ?? null,
      color_id: item.color_id ?? null,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      total_cost: item.quantity * item.unit_cost,
    })
  }

  return { ok: true, items: normalized }
}

/** Attaches the bouquet id to already-validated items. */
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
