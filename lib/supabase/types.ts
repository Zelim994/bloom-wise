// Application-facing Supabase types.
//
// The raw generated schema lives in ./database.generated.ts and is
// machine-owned: it is replaced wholesale by a fresh generation and must never
// be hand-edited. Do not copy generated Database definitions into this file —
// everything here is hand-maintained and inherits from the generated schema.
//
// Two Supabase-generator limitations are corrected below, each narrowly and
// against a verified PostgreSQL contract. Nothing else is overridden.

import type { Database as GeneratedDatabase, Json } from "./database.generated"

export type { Json }

type GeneratedPublic = GeneratedDatabase["public"]
type GeneratedTables = GeneratedPublic["Tables"]
type GeneratedFunctions = GeneratedPublic["Functions"]
type GeneratedOrders = GeneratedTables["orders"]

/**
 * Limitation 1 — trigger-filled columns.
 *
 * orders.order_number is NOT NULL with no DEFAULT: migration_031 dropped the
 * DEFAULT deliberately (a DEFAULT would burn order_number_seq values the
 * trigger then overwrites), and the BEFORE INSERT trigger
 * orders_assign_order_number -> public.assign_order_number() always assigns
 * NEW.order_number. The generator cannot model trigger-filled columns, so the
 * raw schema correctly marks the field required on insert; that stays intact in
 * database.generated.ts.
 *
 * Callers must NOT supply order_number: the database owns numbering.
 */
type OrdersInsert = Omit<GeneratedOrders["Insert"], "order_number"> & {
  order_number?: GeneratedOrders["Insert"]["order_number"]
}

/**
 * Limitation 2 — SQL-nullable function arguments.
 *
 * The generator derives argument optionality from SQL parameter DEFAULTs, which
 * is correct, but it never encodes a nullable `text` parameter as `| null`. The
 * three RPCs below are genuinely called with explicit NULL, so the application
 * contract widens exactly those arguments — and only those. Optionality is left
 * exactly as the SQL declares it; this is NOT a blanket "all text args are
 * nullable" rule.
 */

// create_team_invitation(p_role text, p_invited_name text default null,
//                        p_invited_phone text default null,
//                        p_invited_email text default null)  [migration_022]
// → the three defaulted args are optional AND nullable; p_role stays required.
type CreateTeamInvitationArgs = Omit<
  GeneratedFunctions["create_team_invitation"]["Args"],
  "p_invited_name" | "p_invited_phone" | "p_invited_email"
> & {
  p_invited_name?: string | null
  p_invited_phone?: string | null
  p_invited_email?: string | null
}

// create_purchase_atomic(p_supplier_name text, p_supplier_phone text default
//   null, p_purchase_date date default current_date, p_comment text default
//   null, p_delivery_cost numeric default 0, p_items jsonb default null)
//                                                            [migration_025]
// → only the two failing text args are widened; every other argument keeps the
//   generator's own optionality and type.
type CreatePurchaseAtomicArgs = Omit<
  GeneratedFunctions["create_purchase_atomic"]["Args"],
  "p_supplier_phone" | "p_comment"
> & {
  p_supplier_phone?: string | null
  p_comment?: string | null
}

// create_writeoff_atomic(p_writeoff_date date, p_comment text, p_items jsonb)
//                                                            [migration_024]
// → p_comment has NO DEFAULT, so it must still be SUPPLIED; it is merely
//   allowed to be NULL. Required-and-nullable, deliberately not optional.
type CreateWriteoffAtomicArgs = Omit<
  GeneratedFunctions["create_writeoff_atomic"]["Args"],
  "p_comment"
> & {
  p_comment: string | null
}

// Returns are inherited rather than restated, so future regeneration stays
// authoritative for them. Every other function passes through untouched.
type ApplicationFunctions = Omit<
  GeneratedFunctions,
  "create_team_invitation" | "create_purchase_atomic" | "create_writeoff_atomic"
> & {
  create_team_invitation: Omit<
    GeneratedFunctions["create_team_invitation"],
    "Args"
  > & { Args: CreateTeamInvitationArgs }
  create_purchase_atomic: Omit<
    GeneratedFunctions["create_purchase_atomic"],
    "Args"
  > & { Args: CreatePurchaseAtomicArgs }
  create_writeoff_atomic: Omit<
    GeneratedFunctions["create_writeoff_atomic"],
    "Args"
  > & { Args: CreateWriteoffAtomicArgs }
}

export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedPublic, "Tables" | "Functions"> & {
    Tables: Omit<GeneratedTables, "orders"> & {
      orders: Omit<GeneratedOrders, "Insert"> & { Insert: OrdersInsert }
    }
    Functions: ApplicationFunctions
  }
}

// ── Convenience row type aliases ───────────────────────────────────────────
type PublicTables = Database["public"]["Tables"]
type PublicViews = Database["public"]["Views"]

export type Organization = PublicTables["organizations"]["Row"]
export type Branch = PublicTables["branches"]["Row"]
export type Profile = PublicTables["profiles"]["Row"]
export type Supplier = PublicTables["suppliers"]["Row"]
export type Product = PublicTables["products"]["Row"]
export type ProductBatch = PublicTables["product_batches"]["Row"]
export type InventoryMovement = PublicTables["inventory_movements"]["Row"]
export type Purchase = PublicTables["purchases"]["Row"]
export type PurchaseItem = PublicTables["purchase_items"]["Row"]
export type Writeoff = PublicTables["writeoffs"]["Row"]
export type Customer = PublicTables["customers"]["Row"]
export type Order = PublicTables["orders"]["Row"]
export type Bouquet = PublicTables["bouquets"]["Row"]
export type BouquetItem = PublicTables["bouquet_items"]["Row"]
export type Recipe = PublicTables["recipes"]["Row"]
export type RecipeItem = PublicTables["recipe_items"]["Row"]
export type Payment = PublicTables["payments"]["Row"]
export type WhatsappMessage = PublicTables["whatsapp_messages"]["Row"]
export type AIRequest = PublicTables["ai_requests"]["Row"]
export type ActivityLog = PublicTables["activity_logs"]["Row"]
export type ProductStock = PublicViews["product_stock"]["Row"]
export type Flower = PublicTables["flowers"]["Row"]
export type FlowerVariety = PublicTables["flower_varieties"]["Row"]
export type FlowerColor = PublicTables["flower_colors"]["Row"]
export type FlowerImage = PublicTables["flower_images"]["Row"]
export type InventoryItem = PublicTables["inventory_items"]["Row"]
export type StockMovement = PublicTables["stock_movements"]["Row"]
export type FlowerStock = PublicViews["flower_stock"]["Row"]
export type FlowerVariantStock = PublicViews["flower_variant_stock"]["Row"]

// ── Narrow string enums used in app logic ──────────────────────────────────
// DB stores these as text — the DB type is `string`, these give app-level safety
export type UserRole = "owner" | "admin" | "florist" | "cashier" | "viewer"
export type OrderStatus = "new" | "in_progress" | "ready" | "delivered" | "cancelled"
export type PaymentStatus = "unpaid" | "partial" | "paid"
export type OrderType = "pickup" | "delivery" | "event"
export type MovementType =
  | "purchase"
  | "sale"
  | "writeoff"
  | "return"
  | "adjustment"
  | "bouquet_reserved"
  | "bouquet_unreserved"
export type FreshnessStatus = "fresh" | "aging" | "critical" | "expired"
export type BouquetMode = "stock_only" | "stock_plus_buy" | "free_idea"
export type PurchaseStatus = "draft" | "confirmed" | "cancelled"
