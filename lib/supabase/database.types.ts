export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      curated_recipe_adoptions: {
        Row: {
          adopted_at: string
          curated_recipe_id: string
          household_id: string
          recipe_id: string
        }
        Insert: {
          adopted_at?: string
          curated_recipe_id: string
          household_id: string
          recipe_id: string
        }
        Update: {
          adopted_at?: string
          curated_recipe_id?: string
          household_id?: string
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curated_recipe_adoptions_curated_recipe_id_fkey"
            columns: ["curated_recipe_id"]
            isOneToOne: false
            referencedRelation: "curated_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curated_recipe_adoptions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curated_recipe_adoptions_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: true
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      curated_recipe_collections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          license_name: string
          license_url: string
          name: string
          published: boolean
          slug: string
          source_name: string
          source_url: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          license_name: string
          license_url: string
          name: string
          published?: boolean
          slug: string
          source_name: string
          source_url: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          license_name?: string
          license_url?: string
          name?: string
          published?: boolean
          slug?: string
          source_name?: string
          source_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      curated_recipe_ingredients: {
        Row: {
          created_at: string
          curated_recipe_id: string
          display_order: number
          id: string
          item_name: string
          notes: string | null
          quantity: number | null
          unit: string | null
        }
        Insert: {
          created_at?: string
          curated_recipe_id: string
          display_order?: number
          id?: string
          item_name: string
          notes?: string | null
          quantity?: number | null
          unit?: string | null
        }
        Update: {
          created_at?: string
          curated_recipe_id?: string
          display_order?: number
          id?: string
          item_name?: string
          notes?: string | null
          quantity?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "curated_recipe_ingredients_curated_recipe_id_fkey"
            columns: ["curated_recipe_id"]
            isOneToOne: false
            referencedRelation: "curated_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      curated_recipe_tags: {
        Row: {
          curated_recipe_id: string
          curated_tag_id: string
        }
        Insert: {
          curated_recipe_id: string
          curated_tag_id: string
        }
        Update: {
          curated_recipe_id?: string
          curated_tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curated_recipe_tags_curated_recipe_id_fkey"
            columns: ["curated_recipe_id"]
            isOneToOne: false
            referencedRelation: "curated_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curated_recipe_tags_curated_tag_id_fkey"
            columns: ["curated_tag_id"]
            isOneToOne: false
            referencedRelation: "curated_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      curated_recipes: {
        Row: {
          collection_id: string
          created_at: string
          description: string | null
          id: string
          instructions: string
          published: boolean
          servings: number | null
          slug: string
          source_url: string
          title: string
          updated_at: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          description?: string | null
          id?: string
          instructions: string
          published?: boolean
          servings?: number | null
          slug: string
          source_url: string
          title: string
          updated_at?: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          description?: string | null
          id?: string
          instructions?: string
          published?: boolean
          servings?: number | null
          slug?: string
          source_url?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curated_recipes_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "curated_recipe_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      curated_tags: {
        Row: {
          category: Database["public"]["Enums"]["curated_tag_category"]
          created_at: string
          id: string
          label: string
          slug: string
        }
        Insert: {
          category: Database["public"]["Enums"]["curated_tag_category"]
          created_at?: string
          id?: string
          label: string
          slug: string
        }
        Update: {
          category?: Database["public"]["Enums"]["curated_tag_category"]
          created_at?: string
          id?: string
          label?: string
          slug?: string
        }
        Relationships: []
      }
      household_memberships: {
        Row: {
          created_at: string
          household_id: string
          role: Database["public"]["Enums"]["household_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          role?: Database["public"]["Enums"]["household_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          role?: Database["public"]["Enums"]["household_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_memberships_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      meal_plan_entries: {
        Row: {
          created_at: string
          household_id: string
          id: string
          meal_slot_id: string
          planned_for: string
          recipe_id: string
          status: Database["public"]["Enums"]["meal_plan_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          meal_slot_id: string
          planned_for: string
          recipe_id: string
          status?: Database["public"]["Enums"]["meal_plan_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          meal_slot_id?: string
          planned_for?: string
          recipe_id?: string
          status?: Database["public"]["Enums"]["meal_plan_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_entries_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_entries_meal_slot_id_fkey"
            columns: ["meal_slot_id"]
            isOneToOne: false
            referencedRelation: "meal_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_entries_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_slots: {
        Row: {
          created_at: string
          household_id: string
          id: string
          is_default: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          is_default?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_slots_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      pantry_deductions: {
        Row: {
          created_at: string
          household_id: string
          id: string
          item_name: string
          meal_plan_entry_id: string
          pantry_item_id: string | null
          quantity: number
          recipe_ingredient_id: string | null
          reversed_at: string | null
          status: Database["public"]["Enums"]["deduction_status"]
          unit: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          item_name: string
          meal_plan_entry_id: string
          pantry_item_id?: string | null
          quantity: number
          recipe_ingredient_id?: string | null
          reversed_at?: string | null
          status?: Database["public"]["Enums"]["deduction_status"]
          unit: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          item_name?: string
          meal_plan_entry_id?: string
          pantry_item_id?: string | null
          quantity?: number
          recipe_ingredient_id?: string | null
          reversed_at?: string | null
          status?: Database["public"]["Enums"]["deduction_status"]
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "pantry_deductions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pantry_deductions_meal_plan_entry_id_fkey"
            columns: ["meal_plan_entry_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pantry_deductions_pantry_item_id_fkey"
            columns: ["pantry_item_id"]
            isOneToOne: false
            referencedRelation: "pantry_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pantry_deductions_recipe_ingredient_id_fkey"
            columns: ["recipe_ingredient_id"]
            isOneToOne: false
            referencedRelation: "recipe_ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      pantry_items: {
        Row: {
          category: string | null
          created_at: string
          expiry_date: string | null
          household_id: string
          id: string
          item_name: string
          normalized_item_name: string | null
          quantity: number
          unit: string
          updated_at: string
          version: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          expiry_date?: string | null
          household_id: string
          id?: string
          item_name: string
          normalized_item_name?: string | null
          quantity?: number
          unit: string
          updated_at?: string
          version?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          expiry_date?: string | null
          household_id?: string
          id?: string
          item_name?: string
          normalized_item_name?: string | null
          quantity?: number
          unit?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pantry_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          created_at: string
          display_order: number
          id: string
          item_name: string
          notes: string | null
          quantity: number | null
          recipe_id: string
          unit: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          item_name: string
          notes?: string | null
          quantity?: number | null
          recipe_id: string
          unit?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          item_name?: string
          notes?: string | null
          quantity?: number | null
          recipe_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string
          description: string | null
          favorite: boolean
          household_id: string
          id: string
          ingestion_status: Database["public"]["Enums"]["ingestion_status"]
          instructions: string
          servings: number | null
          source_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          favorite?: boolean
          household_id: string
          id?: string
          ingestion_status?: Database["public"]["Enums"]["ingestion_status"]
          instructions?: string
          servings?: number | null
          source_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          favorite?: boolean
          household_id?: string
          id?: string
          ingestion_status?: Database["public"]["Enums"]["ingestion_status"]
          instructions?: string
          servings?: number | null
          source_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          created_at: string
          delta_quantity: number | null
          id: string
          item_name: string
          pantry_quantity: number | null
          required_quantity: number | null
          review_reason: string | null
          review_required: boolean
          shopping_list_id: string
          status: Database["public"]["Enums"]["shopping_item_status"]
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          delta_quantity?: number | null
          id?: string
          item_name: string
          pantry_quantity?: number | null
          required_quantity?: number | null
          review_reason?: string | null
          review_required?: boolean
          shopping_list_id: string
          status?: Database["public"]["Enums"]["shopping_item_status"]
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          delta_quantity?: number | null
          id?: string
          item_name?: string
          pantry_quantity?: number | null
          required_quantity?: number | null
          review_reason?: string | null
          review_required?: boolean
          shopping_list_id?: string
          status?: Database["public"]["Enums"]["shopping_item_status"]
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_shopping_list_id_fkey"
            columns: ["shopping_list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          created_at: string
          end_date: string
          household_id: string
          id: string
          name: string
          start_date: string
          status: Database["public"]["Enums"]["shopping_list_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          household_id: string
          id?: string
          name: string
          start_date: string
          status?: Database["public"]["Enums"]["shopping_list_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          household_id?: string
          id?: string
          name?: string
          start_date?: string
          status?: Database["public"]["Enums"]["shopping_list_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adopt_curated_recipe: {
        Args: { p_curated_recipe_id: string; p_household_id: string }
        Returns: string
      }
      assign_dinner: {
        Args: {
          p_household_id: string
          p_planned_for: string
          p_recipe_id: string
        }
        Returns: string
      }
      canonical_cooking_unit: { Args: { p_unit: string }; Returns: string }
      complete_meal_plan_entry: {
        Args: { p_entry_id: string }
        Returns: undefined
      }
      confirm_weekly_dinner_plan: {
        Args: {
          p_assignments: Json
          p_household_id: string
          p_week_start: string
        }
        Returns: string[]
      }
      cooking_unit_base_factor: { Args: { p_unit: string }; Returns: number }
      cooking_units_are_compatible: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      create_pantry_item: {
        Args: {
          p_category?: string
          p_expiry_date?: string
          p_household_id: string
          p_item_name: string
          p_quantity: number
          p_unit: string
        }
        Returns: string
      }
      create_recipe_with_ingredients: {
        Args: { p_household_id: string; p_ingredients: Json; p_recipe: Json }
        Returns: string
      }
      create_shopping_list_with_items: {
        Args: {
          p_end_date: string
          p_household_id: string
          p_items: Json
          p_start_date: string
        }
        Returns: string
      }
      decode_recipe_query_component: {
        Args: { p_component: string }
        Returns: string
      }
      delete_pantry_item: {
        Args: { p_expected_version: number; p_item_id: string }
        Returns: undefined
      }
      is_household_member: {
        Args: { target_household_id: string }
        Returns: boolean
      }
      is_sensitive_recipe_query_key: {
        Args: { p_key: string }
        Returns: boolean
      }
      is_valid_recipe_url_authority: {
        Args: { p_authority: string }
        Returns: boolean
      }
      lock_meal_plan_lifecycle: {
        Args: {
          p_household_id: string
          p_meal_slot_id: string
          p_planned_for: string
        }
        Returns: undefined
      }
      reverse_meal_completion_deductions: {
        Args: { p_entry_id: string }
        Returns: undefined
      }
      sanitize_recipe_source_url: {
        Args: { p_source_url: string }
        Returns: string
      }
      set_dinner_status: {
        Args: { p_entry_id: string; p_target_status: string }
        Returns: undefined
      }
      set_shopping_item_status: {
        Args: { p_item_id: string; p_status: string }
        Returns: undefined
      }
      update_pantry_item: {
        Args: {
          p_category?: string
          p_expected_version: number
          p_expiry_date?: string
          p_item_id: string
          p_item_name: string
          p_quantity: number
          p_unit: string
        }
        Returns: number
      }
      update_recipe_with_ingredients: {
        Args: { p_ingredients: Json; p_recipe: Json; p_recipe_id: string }
        Returns: string
      }
    }
    Enums: {
      curated_tag_category:
        | "course"
        | "cuisine"
        | "protein"
        | "method"
        | "dietary"
      deduction_status: "applied" | "reversed" | "review_required"
      household_role: "owner" | "member"
      ingestion_status: "manual" | "parsed" | "needs_review" | "failed"
      meal_plan_status: "planned" | "completed" | "skipped"
      shopping_item_status: "needed" | "checked" | "dismissed"
      shopping_list_status: "draft" | "active" | "archived"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      curated_tag_category: [
        "course",
        "cuisine",
        "protein",
        "method",
        "dietary",
      ],
      deduction_status: ["applied", "reversed", "review_required"],
      household_role: ["owner", "member"],
      ingestion_status: ["manual", "parsed", "needs_review", "failed"],
      meal_plan_status: ["planned", "completed", "skipped"],
      shopping_item_status: ["needed", "checked", "dismissed"],
      shopping_list_status: ["draft", "active", "archived"],
    },
  },
} as const
