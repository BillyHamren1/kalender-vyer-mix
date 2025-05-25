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
      booking_attachments: {
        Row: {
          booking_id: string
          file_name: string | null
          file_type: string | null
          id: string
          uploaded_at: string
          url: string
        }
        Insert: {
          booking_id: string
          file_name?: string | null
          file_type?: string | null
          id?: string
          uploaded_at?: string
          url: string
        }
        Update: {
          booking_id?: string
          file_name?: string | null
          file_type?: string | null
          id?: string
          uploaded_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_attachments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_attachments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "confirmed_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_changes: {
        Row: {
          booking_id: string
          change_type: string
          changed_at: string
          changed_by: string | null
          changed_fields: Json
          id: string
          new_values: Json | null
          previous_values: Json | null
          version: number
        }
        Insert: {
          booking_id: string
          change_type: string
          changed_at?: string
          changed_by?: string | null
          changed_fields: Json
          id?: string
          new_values?: Json | null
          previous_values?: Json | null
          version: number
        }
        Update: {
          booking_id?: string
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          changed_fields?: Json
          id?: string
          new_values?: Json | null
          previous_values?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_changes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_changes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "confirmed_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_products: {
        Row: {
          booking_id: string
          id: string
          name: string
          notes: string | null
          quantity: number
        }
        Insert: {
          booking_id: string
          id?: string
          name: string
          notes?: string | null
          quantity?: number
        }
        Update: {
          booking_id?: string
          id?: string
          name?: string
          notes?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_products_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_products_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "confirmed_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booking_number: string | null
          carry_more_than_10m: boolean | null
          client: string
          created_at: string
          delivery_city: string | null
          delivery_latitude: number | null
          delivery_longitude: number | null
          delivery_postal_code: string | null
          deliveryaddress: string | null
          eventdate: string | null
          exact_time_info: string | null
          exact_time_needed: boolean | null
          ground_nails_allowed: boolean | null
          id: string
          internalnotes: string | null
          rigdaydate: string | null
          rigdowndate: string | null
          status: string | null
          updated_at: string
          version: number
          viewed: boolean
        }
        Insert: {
          booking_number?: string | null
          carry_more_than_10m?: boolean | null
          client: string
          created_at?: string
          delivery_city?: string | null
          delivery_latitude?: number | null
          delivery_longitude?: number | null
          delivery_postal_code?: string | null
          deliveryaddress?: string | null
          eventdate?: string | null
          exact_time_info?: string | null
          exact_time_needed?: boolean | null
          ground_nails_allowed?: boolean | null
          id: string
          internalnotes?: string | null
          rigdaydate?: string | null
          rigdowndate?: string | null
          status?: string | null
          updated_at?: string
          version?: number
          viewed?: boolean
        }
        Update: {
          booking_number?: string | null
          carry_more_than_10m?: boolean | null
          client?: string
          created_at?: string
          delivery_city?: string | null
          delivery_latitude?: number | null
          delivery_longitude?: number | null
          delivery_postal_code?: string | null
          deliveryaddress?: string | null
          eventdate?: string | null
          exact_time_info?: string | null
          exact_time_needed?: boolean | null
          ground_nails_allowed?: boolean | null
          id?: string
          internalnotes?: string | null
          rigdaydate?: string | null
          rigdowndate?: string | null
          status?: string | null
          updated_at?: string
          version?: number
          viewed?: boolean
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          booking_id: string | null
          created_at: string
          end_time: string
          event_type: string | null
          id: string
          resource_id: string
          start_time: string
          title: string
          viewed: boolean | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          end_time: string
          event_type?: string | null
          id?: string
          resource_id: string
          start_time: string
          title: string
          viewed?: boolean | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          end_time?: string
          event_type?: string | null
          id?: string
          resource_id?: string
          start_time?: string
          title?: string
          viewed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "confirmed_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_assignments: {
        Row: {
          assignment_date: string
          created_at: string
          id: string
          staff_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          assignment_date: string
          created_at?: string
          id?: string
          staff_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          assignment_date?: string
          created_at?: string
          id?: string
          staff_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          name: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      sync_state: {
        Row: {
          created_at: string
          id: string
          last_sync_mode: string | null
          last_sync_status: string | null
          last_sync_timestamp: string | null
          metadata: Json | null
          sync_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_sync_mode?: string | null
          last_sync_status?: string | null
          last_sync_timestamp?: string | null
          metadata?: Json | null
          sync_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_sync_mode?: string | null
          last_sync_status?: string | null
          last_sync_timestamp?: string | null
          metadata?: Json | null
          sync_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhook_subscriptions: {
        Row: {
          created_at: string
          events: string[]
          id: string
          is_active: boolean
          last_triggered_at: string | null
          name: string
          secret_key: string
          url: string
        }
        Insert: {
          created_at?: string
          events: string[]
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name: string
          secret_key: string
          url: string
        }
        Update: {
          created_at?: string
          events?: string[]
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name?: string
          secret_key?: string
          url?: string
        }
        Relationships: []
      }
    }
    Views: {
      confirmed_bookings: {
        Row: {
          id: string | null
        }
        Insert: {
          id?: string | null
        }
        Update: {
          id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      jsonb_object_keys_array: {
        Args: { j: Json }
        Returns: string[]
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

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
