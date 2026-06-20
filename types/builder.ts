// Shared types for the Bouquet Builder module.
// Used in: app/actions/builder.ts, components/bouquet-builder/*, components/orders/OrderForm, components/recipes/RecipeForm

export type FlowerForBuilder = {
  id: string
  name: string
  unit: string
  category: string
  current_stock: number
  unit_cost: number
  sale_price: number | null
}

export type BouquetItem = {
  _id: string
  flower_id: string
  name: string
  unit: string
  quantity: number
  unit_cost: number
  current_stock: number
  variety_id?: string | null
  color_id?: string | null
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
