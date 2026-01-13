export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
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
      booking_staff_assignments: {
        Row: {
          assignment_date: string
          booking_id: string
          created_at: string
          id: string
          staff_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          assignment_date: string
          booking_id: string
          created_at?: string
          id?: string
          staff_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          assignment_date?: string
          booking_id?: string
          created_at?: string
          id?: string
          staff_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          assigned_project_id: string | null
          assigned_project_name: string | null
          assigned_to_project: boolean | null
          booking_number: string | null
          carry_more_than_10m: boolean | null
          client: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          delivery_city: string | null
          delivery_latitude: number | null
          delivery_longitude: number | null
          delivery_postal_code: string | null
          deliveryaddress: string | null
          event_end_time: string | null
          event_start_time: string | null
          eventdate: string | null
          exact_time_info: string | null
          exact_time_needed: boolean | null
          ground_nails_allowed: boolean | null
          id: string
          internalnotes: string | null
          last_calendar_sync: string | null
          rig_end_time: string | null
          rig_start_time: string | null
          rigdaydate: string | null
          rigdown_end_time: string | null
          rigdown_start_time: string | null
          rigdowndate: string | null
          status: string | null
          updated_at: string
          version: number
          viewed: boolean
        }
        Insert: {
          assigned_project_id?: string | null
          assigned_project_name?: string | null
          assigned_to_project?: boolean | null
          booking_number?: string | null
          carry_more_than_10m?: boolean | null
          client: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          delivery_city?: string | null
          delivery_latitude?: number | null
          delivery_longitude?: number | null
          delivery_postal_code?: string | null
          deliveryaddress?: string | null
          event_end_time?: string | null
          event_start_time?: string | null
          eventdate?: string | null
          exact_time_info?: string | null
          exact_time_needed?: boolean | null
          ground_nails_allowed?: boolean | null
          id: string
          internalnotes?: string | null
          last_calendar_sync?: string | null
          rig_end_time?: string | null
          rig_start_time?: string | null
          rigdaydate?: string | null
          rigdown_end_time?: string | null
          rigdown_start_time?: string | null
          rigdowndate?: string | null
          status?: string | null
          updated_at?: string
          version?: number
          viewed?: boolean
        }
        Update: {
          assigned_project_id?: string | null
          assigned_project_name?: string | null
          assigned_to_project?: boolean | null
          booking_number?: string | null
          carry_more_than_10m?: boolean | null
          client?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          delivery_city?: string | null
          delivery_latitude?: number | null
          delivery_longitude?: number | null
          delivery_postal_code?: string | null
          deliveryaddress?: string | null
          event_end_time?: string | null
          event_start_time?: string | null
          eventdate?: string | null
          exact_time_info?: string | null
          exact_time_needed?: boolean | null
          ground_nails_allowed?: boolean | null
          id?: string
          internalnotes?: string | null
          last_calendar_sync?: string | null
          rig_end_time?: string | null
          rig_start_time?: string | null
          rigdaydate?: string | null
          rigdown_end_time?: string | null
          rigdown_start_time?: string | null
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
          booking_number: string | null
          created_at: string
          delivery_address: string | null
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
          booking_number?: string | null
          created_at?: string
          delivery_address?: string | null
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
          booking_number?: string | null
          created_at?: string
          delivery_address?: string | null
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
      project_comments: {
        Row: {
          author_name: string
          content: string
          created_at: string
          id: string
          project_id: string
        }
        Insert: {
          author_name: string
          content: string
          created_at?: string
          id?: string
          project_id: string
        }
        Update: {
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_files: {
        Row: {
          file_name: string
          file_type: string | null
          id: string
          project_id: string
          uploaded_at: string
          uploaded_by: string | null
          url: string
        }
        Insert: {
          file_name: string
          file_type?: string | null
          id?: string
          project_id: string
          uploaded_at?: string
          uploaded_by?: string | null
          url: string
        }
        Update: {
          file_name?: string
          file_type?: string | null
          id?: string
          project_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          assigned_to: string | null
          completed: boolean
          created_at: string
          deadline: string | null
          description: string | null
          id: string
          is_info_only: boolean | null
          project_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed?: boolean
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          is_info_only?: boolean | null
          project_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed?: boolean
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          is_info_only?: boolean | null
          project_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          name: string
          project_leader: string | null
          status: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          name: string
          project_leader?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          name?: string
          project_leader?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "confirmed_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_accounts: {
        Row: {
          created_at: string
          id: string
          password_hash: string
          staff_id: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          password_hash: string
          staff_id: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          password_hash?: string
          staff_id?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_accounts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
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
      staff_availability: {
        Row: {
          availability_type: Database["public"]["Enums"]["availability_type"]
          created_at: string
          end_date: string
          id: string
          notes: string | null
          staff_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          availability_type: Database["public"]["Enums"]["availability_type"]
          created_at?: string
          end_date: string
          id?: string
          notes?: string | null
          staff_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          availability_type?: Database["public"]["Enums"]["availability_type"]
          created_at?: string
          end_date?: string
          id?: string
          notes?: string | null
          staff_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_availability_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          address: string | null
          city: string | null
          color: string | null
          created_at: string
          department: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          hire_date: string | null
          hourly_rate: number | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          overtime_rate: number | null
          phone: string | null
          postal_code: string | null
          role: string | null
          salary: number | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          color?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          hire_date?: string | null
          hourly_rate?: number | null
          id: string
          is_active?: boolean
          name: string
          notes?: string | null
          overtime_rate?: number | null
          phone?: string | null
          postal_code?: string | null
          role?: string | null
          salary?: number | null
        }
        Update: {
          address?: string | null
          city?: string | null
          color?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          hire_date?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          overtime_rate?: number | null
          phone?: string | null
          postal_code?: string | null
          role?: string | null
          salary?: number | null
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
      task_comments: {
        Row: {
          author_id: string | null
          author_name: string
          content: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_id?: string | null
          author_name: string
          content: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      time_reports: {
        Row: {
          booking_id: string
          break_time: number | null
          created_at: string
          description: string | null
          end_time: string | null
          hours_worked: number
          id: string
          overtime_hours: number | null
          report_date: string
          staff_id: string
          start_time: string | null
          updated_at: string
        }
        Insert: {
          booking_id: string
          break_time?: number | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          hours_worked?: number
          id?: string
          overtime_hours?: number | null
          report_date: string
          staff_id: string
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          booking_id?: string
          break_time?: number | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          hours_worked?: number
          id?: string
          overtime_hours?: number | null
          report_date?: string
          staff_id?: string
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_reports_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_reports_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "confirmed_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_reports_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
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
      cleanup_duplicate_calendar_events: {
        Args: never
        Returns: {
          booking_id_result: string
          duplicates_removed: number
          event_type_result: string
        }[]
      }
      handle_booking_move: {
        Args: {
          p_booking_id: string
          p_new_date: string
          p_new_team_id: string
          p_old_date: string
          p_old_team_id: string
        }
        Returns: Json
      }
      jsonb_object_keys_array: { Args: { j: Json }; Returns: string[] }
    }
    Enums: {
      availability_type: "available" | "unavailable" | "blocked"
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
      availability_type: ["available", "unavailable", "blocked"],
    },
  },
} as const
