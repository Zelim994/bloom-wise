// Shared types for the Bouquet Builder module.
// Used in: app/actions/builder.ts, components/bouquet-builder/*, components/orders/OrderForm, components/recipes/RecipeForm

export type FlowerForBuilder = {
  // id is the stock_key: `${flower_id}:${variety_id ?? "none"}:${color_id ?? "none"}`
  // Used as the unique identifier per stock position so Mondial·80 and Mondial·100 don't collide.
  id: string
  flower_id: string
  name: string
  unit: string
  category: string
  variety_id: string | null
  variety_name: string | null
  variety_size: string | null
  color_id: string | null
  color_name: string | null
  current_stock: number
  unit_cost: number
  sale_price: number | null
}

export type BouquetItem = {
  _id: string
  flower_id: string
  variety_id?: string | null
  color_id?: string | null
  variety_name?: string | null
  variety_size?: string | null
  color_name?: string | null
  name: string
  unit: string
  quantity: number
  unit_cost: number
  sale_price: number | null
  current_stock: number
}

export type BouquetData = {
  items: Array<{
    flower_id: string
    name: string
    unit: string
    quantity: number
    unit_cost: number
    variety_id?: string | null
    color_id?: string | null
  }>
  cost_price: number
  sale_price: number
  profit: number
  margin_percent: number
}

export type InitialBuilderItem = {
  flower_id: string
  name: string
  unit: string
  quantity: number
  unit_cost: number
  variety_id?: string | null
  color_id?: string | null
}
