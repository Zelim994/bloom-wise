// Auto-generated from Supabase schema — do not edit the Database section.
// Re-run: npx supabase gen types via MCP generate_typescript_types

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          branch_id: string | null
          changes: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          organization_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          branch_id?: string | null
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          organization_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          branch_id?: string | null
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          organization_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_requests: {
        Row: {
          bouquet_id: string | null
          created_at: string
          created_by: string | null
          id: string
          input_params: Json | null
          mode: string | null
          model_used: string | null
          organization_id: string
          request_type: string | null
          response_data: Json | null
          tokens_used: number | null
        }
        Insert: {
          bouquet_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          input_params?: Json | null
          mode?: string | null
          model_used?: string | null
          organization_id: string
          request_type?: string | null
          response_data?: Json | null
          tokens_used?: number | null
        }
        Update: {
          bouquet_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          input_params?: Json | null
          mode?: string | null
          model_used?: string | null
          organization_id?: string
          request_type?: string | null
          response_data?: Json | null
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_requests_bouquet_id_fkey"
            columns: ["bouquet_id"]
            isOneToOne: false
            referencedRelation: "bouquets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bouquet_items: {
        Row: {
          batch_id: string | null
          bouquet_id: string
          flower_id: string | null
          id: string
          product_id: string | null
          quantity: number
          sale_price: number | null
          total_cost: number | null
          total_sale: number | null
          unit_cost: number | null
        }
        Insert: {
          batch_id?: string | null
          bouquet_id: string
          flower_id?: string | null
          id?: string
          product_id?: string | null
          quantity: number
          sale_price?: number | null
          total_cost?: number | null
          total_sale?: number | null
          unit_cost?: number | null
        }
        Update: {
          batch_id?: string | null
          bouquet_id?: string
          flower_id?: string | null
          id?: string
          product_id?: string | null
          quantity?: number
          sale_price?: number | null
          total_cost?: number | null
          total_sale?: number | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bouquet_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bouquet_items_bouquet_id_fkey"
            columns: ["bouquet_id"]
            isOneToOne: false
            referencedRelation: "bouquets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bouquet_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      bouquets: {
        Row: {
          budget: number | null
          cost_price: number | null
          created_at: string
          created_by: string | null
          decor: string | null
          florist_comment: string | null
          id: string
          is_display: boolean
          margin_percent: number | null
          mode: string
          name: string | null
          order_id: string | null
          packaging: string | null
          photo_url: string | null
          preview_image_url: string | null
          profit: number | null
          recipe_id: string | null
          sale_price: number | null
          style: string | null
          updated_at: string
        }
        Insert: {
          budget?: number | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          decor?: string | null
          florist_comment?: string | null
          id?: string
          is_display?: boolean
          margin_percent?: number | null
          mode?: string
          name?: string | null
          order_id?: string | null
          packaging?: string | null
          photo_url?: string | null
          preview_image_url?: string | null
          profit?: number | null
          recipe_id?: string | null
          sale_price?: number | null
          style?: string | null
          updated_at?: string
        }
        Update: {
          budget?: number | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          decor?: string | null
          florist_comment?: string | null
          id?: string
          is_display?: boolean
          margin_percent?: number | null
          mode?: string
          name?: string | null
          order_id?: string | null
          packaging?: string | null
          photo_url?: string | null
          preview_image_url?: string | null
          profit?: number | null
          recipe_id?: string | null
          sale_price?: number | null
          style?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bouquets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bouquets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bouquets_recipe"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          avg_check: number | null
          comment: string | null
          created_at: string
          created_by: string | null
          favorite_colors: string[] | null
          favorite_flowers: string[] | null
          full_name: string
          id: string
          important_dates: Json | null
          organization_id: string
          phone: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          avg_check?: number | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          favorite_colors?: string[] | null
          favorite_flowers?: string[] | null
          full_name: string
          id?: string
          important_dates?: Json | null
          organization_id: string
          phone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          avg_check?: number | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          favorite_colors?: string[] | null
          favorite_flowers?: string[] | null
          full_name?: string
          id?: string
          important_dates?: Json | null
          organization_id?: string
          phone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      flower_colors: {
        Row: {
          created_at: string | null
          flower_id: string
          hex_code: string | null
          id: string
          is_active: boolean | null
          name: string
          variety_id: string | null
        }
        Insert: {
          created_at?: string | null
          flower_id: string
          hex_code?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          variety_id?: string | null
        }
        Update: {
          created_at?: string | null
          flower_id?: string
          hex_code?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          variety_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flower_colors_flower_id_fkey"
            columns: ["flower_id"]
            isOneToOne: false
            referencedRelation: "flowers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flower_colors_variety_id_fkey"
            columns: ["variety_id"]
            isOneToOne: false
            referencedRelation: "flower_varieties"
            referencedColumns: ["id"]
          },
        ]
      }
      flower_images: {
        Row: {
          color_id: string | null
          created_at: string | null
          flower_id: string
          id: string
          is_primary: boolean | null
          sort_order: number | null
          url: string
          variety_id: string | null
        }
        Insert: {
          color_id?: string | null
          created_at?: string | null
          flower_id: string
          id?: string
          is_primary?: boolean | null
          sort_order?: number | null
          url: string
          variety_id?: string | null
        }
        Update: {
          color_id?: string | null
          created_at?: string | null
          flower_id?: string
          id?: string
          is_primary?: boolean | null
          sort_order?: number | null
          url?: string
          variety_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flower_images_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "flower_colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flower_images_flower_id_fkey"
            columns: ["flower_id"]
            isOneToOne: false
            referencedRelation: "flowers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flower_images_variety_id_fkey"
            columns: ["variety_id"]
            isOneToOne: false
            referencedRelation: "flower_varieties"
            referencedColumns: ["id"]
          },
        ]
      }
      flower_varieties: {
        Row: {
          created_at: string | null
          flower_id: string
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          size: string | null
        }
        Insert: {
          created_at?: string | null
          flower_id: string
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          size?: string | null
        }
        Update: {
          created_at?: string | null
          flower_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          size?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flower_varieties_flower_id_fkey"
            columns: ["flower_id"]
            isOneToOne: false
            referencedRelation: "flowers"
            referencedColumns: ["id"]
          },
        ]
      }
      flowers: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          florist_comment: string | null
          id: string
          is_active: boolean | null
          min_stock: number | null
          name: string
          organization_id: string
          sale_price: number | null
          sku: string | null
          unit: string
          updated_at: string | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          florist_comment?: string | null
          id?: string
          is_active?: boolean | null
          min_stock?: number | null
          name: string
          organization_id: string
          sale_price?: number | null
          sku?: string | null
          unit?: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          florist_comment?: string | null
          id?: string
          is_active?: boolean | null
          min_stock?: number | null
          name?: string
          organization_id?: string
          sale_price?: number | null
          sku?: string | null
          unit?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flowers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flowers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          batch_id: string | null
          branch_id: string | null
          comment: string | null
          created_at: string
          created_by: string | null
          id: string
          movement_type: string
          organization_id: string
          product_id: string
          quantity: number
          source_id: string | null
          source_type: string | null
        }
        Insert: {
          batch_id?: string | null
          branch_id?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: string
          organization_id: string
          product_id: string
          quantity: number
          source_id?: string | null
          source_type?: string | null
        }
        Update: {
          batch_id?: string | null
          branch_id?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: string
          organization_id?: string
          product_id?: string
          quantity?: number
          source_id?: string | null
          source_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          arrived_at: string
          branch_id: string | null
          color_id: string | null
          comment: string | null
          cost_price: number
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          flower_id: string
          freshness_status: string | null
          id: string
          organization_id: string
          purchase_id: string | null
          quantity_in: number
          quantity_remaining: number
          sale_price: number | null
          supplier_id: string | null
          updated_at: string | null
          variety_id: string | null
        }
        Insert: {
          arrived_at?: string
          branch_id?: string | null
          color_id?: string | null
          comment?: string | null
          cost_price: number
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          flower_id: string
          freshness_status?: string | null
          id?: string
          organization_id: string
          purchase_id?: string | null
          quantity_in: number
          quantity_remaining: number
          sale_price?: number | null
          supplier_id?: string | null
          updated_at?: string | null
          variety_id?: string | null
        }
        Update: {
          arrived_at?: string
          branch_id?: string | null
          color_id?: string | null
          comment?: string | null
          cost_price?: number
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          flower_id?: string
          freshness_status?: string | null
          id?: string
          organization_id?: string
          purchase_id?: string | null
          quantity_in?: number
          quantity_remaining?: number
          sale_price?: number | null
          supplier_id?: string | null
          updated_at?: string | null
          variety_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "flower_colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_flower_id_fkey"
            columns: ["flower_id"]
            isOneToOne: false
            referencedRelation: "flowers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_variety_id_fkey"
            columns: ["variety_id"]
            isOneToOne: false
            referencedRelation: "flower_varieties"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          branch_id: string | null
          cost_price: number | null
          created_at: string
          created_by: string | null
          customer_comment: string | null
          customer_id: string | null
          delivery_address: string | null
          delivery_cost: number
          discount: number
          florist_comment: string | null
          florist_id: string | null
          id: string
          margin_percent: number | null
          order_date: string
          order_number: string
          organization_id: string
          paid_amount: number
          payment_method: string | null
          payment_status: string
          profit: number | null
          ready_at: string | null
          status: string
          stock_returned: boolean
          stock_written_off: boolean
          subtotal: number | null
          total_amount: number | null
          type: string
          updated_at: string
          whatsapp_sent: boolean
        }
        Insert: {
          branch_id?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          customer_comment?: string | null
          customer_id?: string | null
          delivery_address?: string | null
          delivery_cost?: number
          discount?: number
          florist_comment?: string | null
          florist_id?: string | null
          id?: string
          margin_percent?: number | null
          order_date?: string
          order_number?: string
          organization_id: string
          paid_amount?: number
          payment_method?: string | null
          payment_status?: string
          profit?: number | null
          ready_at?: string | null
          status?: string
          stock_returned?: boolean
          stock_written_off?: boolean
          subtotal?: number | null
          total_amount?: number | null
          type?: string
          updated_at?: string
          whatsapp_sent?: boolean
        }
        Update: {
          branch_id?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          customer_comment?: string | null
          customer_id?: string | null
          delivery_address?: string | null
          delivery_cost?: number
          discount?: number
          florist_comment?: string | null
          florist_id?: string | null
          id?: string
          margin_percent?: number | null
          order_date?: string
          order_number?: string
          organization_id?: string
          paid_amount?: number
          payment_method?: string | null
          payment_status?: string
          profit?: number | null
          ready_at?: string | null
          status?: string
          stock_returned?: boolean
          stock_written_off?: boolean
          subtotal?: number | null
          total_amount?: number | null
          type?: string
          updated_at?: string
          whatsapp_sent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_florist_id_fkey"
            columns: ["florist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          plan: string
          settings: Json
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan?: string
          settings?: Json
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan?: string
          settings?: Json
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          comment: string | null
          created_by: string | null
          id: string
          method: string | null
          order_id: string
          paid_at: string
        }
        Insert: {
          amount: number
          comment?: string | null
          created_by?: string | null
          id?: string
          method?: string | null
          order_id: string
          paid_at?: string
        }
        Update: {
          amount?: number
          comment?: string | null
          created_by?: string | null
          id?: string
          method?: string | null
          order_id?: string
          paid_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_batches: {
        Row: {
          arrived_at: string
          branch_id: string | null
          comment: string | null
          cost_price: number
          created_at: string
          created_by: string | null
          expires_at: string | null
          extra_costs: number
          freshness_status: string
          id: string
          organization_id: string
          photo_url: string | null
          product_id: string
          quantity_in: number
          quantity_left: number
          supplier_id: string | null
          unit_cost_total: number | null
          updated_at: string
        }
        Insert: {
          arrived_at?: string
          branch_id?: string | null
          comment?: string | null
          cost_price: number
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          extra_costs?: number
          freshness_status?: string
          id?: string
          organization_id: string
          photo_url?: string | null
          product_id: string
          quantity_in: number
          quantity_left: number
          supplier_id?: string | null
          unit_cost_total?: number | null
          updated_at?: string
        }
        Update: {
          arrived_at?: string
          branch_id?: string | null
          comment?: string | null
          cost_price?: number
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          extra_costs?: number
          freshness_status?: string
          id?: string
          organization_id?: string
          photo_url?: string | null
          product_id?: string
          quantity_in?: number
          quantity_left?: number
          supplier_id?: string | null
          unit_cost_total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          alt_names: string[] | null
          category: string
          color: string | null
          color_shade: string | null
          compatible_with: string[] | null
          created_at: string
          created_by: string | null
          florist_comment: string | null
          id: string
          is_active: boolean
          min_stock: number
          name: string
          organization_id: string
          photo_url: string | null
          possible_substitutes: string[] | null
          role_in_bouquet: string | null
          sale_price: number | null
          seasonality: string[] | null
          styles: string[] | null
          unit: string
          updated_at: string
          variety: string | null
        }
        Insert: {
          alt_names?: string[] | null
          category: string
          color?: string | null
          color_shade?: string | null
          compatible_with?: string[] | null
          created_at?: string
          created_by?: string | null
          florist_comment?: string | null
          id?: string
          is_active?: boolean
          min_stock?: number
          name: string
          organization_id: string
          photo_url?: string | null
          possible_substitutes?: string[] | null
          role_in_bouquet?: string | null
          sale_price?: number | null
          seasonality?: string[] | null
          styles?: string[] | null
          unit?: string
          updated_at?: string
          variety?: string | null
        }
        Update: {
          alt_names?: string[] | null
          category?: string
          color?: string | null
          color_shade?: string | null
          compatible_with?: string[] | null
          created_at?: string
          created_by?: string | null
          florist_comment?: string | null
          id?: string
          is_active?: boolean
          min_stock?: number
          name?: string
          organization_id?: string
          photo_url?: string | null
          possible_substitutes?: string[] | null
          role_in_bouquet?: string | null
          sale_price?: number | null
          seasonality?: string[] | null
          styles?: string[] | null
          unit?: string
          updated_at?: string
          variety?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          branch_id: string | null
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          organization_id: string | null
          phone: string | null
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          organization_id?: string | null
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string | null
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          batch_id: string | null
          comment: string | null
          cost_price: number
          expires_at: string | null
          extra_costs: number
          flower_id: string | null
          id: string
          inventory_item_id: string | null
          product_id: string | null
          purchase_id: string
          quantity: number
        }
        Insert: {
          batch_id?: string | null
          comment?: string | null
          cost_price: number
          expires_at?: string | null
          extra_costs?: number
          flower_id?: string | null
          id?: string
          inventory_item_id?: string | null
          product_id?: string | null
          purchase_id: string
          quantity: number
        }
        Update: {
          batch_id?: string | null
          comment?: string | null
          cost_price?: number
          expires_at?: string | null
          extra_costs?: number
          flower_id?: string | null
          id?: string
          inventory_item_id?: string | null
          product_id?: string | null
          purchase_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_flower_id_fkey"
            columns: ["flower_id"]
            isOneToOne: false
            referencedRelation: "flowers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          branch_id: string | null
          comment: string | null
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          purchase_date: string
          status: string
          supplier_id: string | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          purchase_date?: string
          status?: string
          supplier_id?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          purchase_date?: string
          status?: string
          supplier_id?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_items: {
        Row: {
          flower_id: string | null
          id: string
          note: string | null
          product_id: string | null
          quantity: number
          recipe_id: string
          unit_cost: number | null
        }
        Insert: {
          flower_id?: string | null
          id?: string
          note?: string | null
          product_id?: string | null
          quantity: number
          recipe_id: string
          unit_cost?: number | null
        }
        Update: {
          flower_id?: string | null
          id?: string
          note?: string | null
          product_id?: string | null
          quantity?: number
          recipe_id?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          assembly_notes: string | null
          comment: string | null
          cost_price: number | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          margin_percent: number | null
          name: string
          organization_id: string
          photo_url: string | null
          recommended_price: number | null
          style: string | null
          updated_at: string
        }
        Insert: {
          assembly_notes?: string | null
          comment?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          margin_percent?: number | null
          name: string
          organization_id: string
          photo_url?: string | null
          recommended_price?: number | null
          style?: string | null
          updated_at?: string
        }
        Update: {
          assembly_notes?: string | null
          comment?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          margin_percent?: number | null
          name?: string
          organization_id?: string
          photo_url?: string | null
          recommended_price?: number | null
          style?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          branch_id: string | null
          comment: string | null
          created_at: string | null
          created_by: string | null
          flower_id: string
          id: string
          inventory_item_id: string
          movement_type: string
          organization_id: string
          quantity: number
          source_id: string | null
          source_type: string | null
        }
        Insert: {
          branch_id?: string | null
          comment?: string | null
          created_at?: string | null
          created_by?: string | null
          flower_id: string
          id?: string
          inventory_item_id: string
          movement_type: string
          organization_id: string
          quantity: number
          source_id?: string | null
          source_type?: string | null
        }
        Update: {
          branch_id?: string | null
          comment?: string | null
          created_at?: string | null
          created_by?: string | null
          flower_id?: string
          id?: string
          inventory_item_id?: string
          movement_type?: string
          organization_id?: string
          quantity?: number
          source_id?: string | null
          source_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_flower_id_fkey"
            columns: ["flower_id"]
            isOneToOne: false
            referencedRelation: "flowers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          comment: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          payment_terms: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          comment?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          payment_terms?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          comment?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          payment_terms?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          id: string
          message: string
          order_id: string | null
          phone: string
          sent_at: string
          sent_by: string | null
        }
        Insert: {
          id?: string
          message: string
          order_id?: string | null
          phone: string
          sent_at?: string
          sent_by?: string | null
        }
        Update: {
          id?: string
          message?: string
          order_id?: string | null
          phone?: string
          sent_at?: string
          sent_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      writeoffs: {
        Row: {
          batch_id: string | null
          branch_id: string | null
          comment: string | null
          created_at: string
          created_by: string | null
          flower_id: string | null
          id: string
          inventory_item_id: string | null
          loss_amount: number | null
          organization_id: string
          photo_url: string | null
          product_id: string | null
          quantity: number
          reason: string | null
          updated_at: string
          writeoff_date: string
        }
        Insert: {
          batch_id?: string | null
          branch_id?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          flower_id?: string | null
          id?: string
          inventory_item_id?: string | null
          loss_amount?: number | null
          organization_id: string
          photo_url?: string | null
          product_id?: string | null
          quantity: number
          reason?: string | null
          updated_at?: string
          writeoff_date?: string
        }
        Update: {
          batch_id?: string | null
          branch_id?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          flower_id?: string | null
          id?: string
          inventory_item_id?: string | null
          loss_amount?: number | null
          organization_id?: string
          photo_url?: string | null
          product_id?: string | null
          quantity?: number
          reason?: string | null
          updated_at?: string
          writeoff_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "writeoffs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writeoffs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writeoffs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writeoffs_flower_id_fkey"
            columns: ["flower_id"]
            isOneToOne: false
            referencedRelation: "flowers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writeoffs_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writeoffs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writeoffs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      flower_stock: {
        Row: {
          current_stock: number | null
          flower_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_flower_id_fkey"
            columns: ["flower_id"]
            isOneToOne: false
            referencedRelation: "flowers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_stock: {
        Row: {
          current_stock: number | null
          organization_id: string | null
          product_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_my_organization: { Args: { p_org_name: string }; Returns: string }
      get_user_organization_id: { Args: never; Returns: string }
      write_off_order_stock: {
        Args: {
          p_order_id: string
          p_allocations: Json
        }
        Returns: Json
      }
      return_order_stock: {
        Args: {
          p_order_id: string
        }
        Returns: Json
      }
      create_purchase_atomic: {
        Args: {
          p_supplier_name:   string
          p_supplier_phone?: string | null
          p_purchase_date?:  string
          p_comment?:        string | null
          p_delivery_cost?:  number
          p_items?:          Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
