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
          assembly_cost: number | null
          booking_id: string
          cost_notes: string | null
          discount: number | null
          estimated_volume_m3: number | null
          estimated_weight_kg: number | null
          external_cost: number | null
          handling_cost: number | null
          id: string
          inventory_item_type_id: string | null
          inventory_package_id: string | null
          is_package_component: boolean | null
          labor_cost: number | null
          material_cost: number | null
          name: string
          notes: string | null
          package_components: Json | null
          parent_package_id: string | null
          parent_product_id: string | null
          purchase_cost: number | null
          quantity: number
          setup_hours: number | null
          sku: string | null
          sort_index: number | null
          total_price: number | null
          unit_price: number | null
          vat_rate: number | null
        }
        Insert: {
          assembly_cost?: number | null
          booking_id: string
          cost_notes?: string | null
          discount?: number | null
          estimated_volume_m3?: number | null
          estimated_weight_kg?: number | null
          external_cost?: number | null
          handling_cost?: number | null
          id?: string
          inventory_item_type_id?: string | null
          inventory_package_id?: string | null
          is_package_component?: boolean | null
          labor_cost?: number | null
          material_cost?: number | null
          name: string
          notes?: string | null
          package_components?: Json | null
          parent_package_id?: string | null
          parent_product_id?: string | null
          purchase_cost?: number | null
          quantity?: number
          setup_hours?: number | null
          sku?: string | null
          sort_index?: number | null
          total_price?: number | null
          unit_price?: number | null
          vat_rate?: number | null
        }
        Update: {
          assembly_cost?: number | null
          booking_id?: string
          cost_notes?: string | null
          discount?: number | null
          estimated_volume_m3?: number | null
          estimated_weight_kg?: number | null
          external_cost?: number | null
          handling_cost?: number | null
          id?: string
          inventory_item_type_id?: string | null
          inventory_package_id?: string | null
          is_package_component?: boolean | null
          labor_cost?: number | null
          material_cost?: number | null
          name?: string
          notes?: string | null
          package_components?: Json | null
          parent_package_id?: string | null
          parent_product_id?: string | null
          purchase_cost?: number | null
          quantity?: number
          setup_hours?: number | null
          sku?: string | null
          sort_index?: number | null
          total_price?: number | null
          unit_price?: number | null
          vat_rate?: number | null
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
          {
            foreignKeyName: "booking_products_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "booking_products"
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
          economics_data: Json | null
          event_end_time: string | null
          event_start_time: string | null
          eventdate: string | null
          exact_time_info: string | null
          exact_time_needed: boolean | null
          ground_nails_allowed: boolean | null
          id: string
          internalnotes: string | null
          large_project_id: string | null
          last_calendar_sync: string | null
          map_drawing_url: string | null
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
          economics_data?: Json | null
          event_end_time?: string | null
          event_start_time?: string | null
          eventdate?: string | null
          exact_time_info?: string | null
          exact_time_needed?: boolean | null
          ground_nails_allowed?: boolean | null
          id: string
          internalnotes?: string | null
          large_project_id?: string | null
          last_calendar_sync?: string | null
          map_drawing_url?: string | null
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
          economics_data?: Json | null
          event_end_time?: string | null
          event_start_time?: string | null
          eventdate?: string | null
          exact_time_info?: string | null
          exact_time_needed?: boolean | null
          ground_nails_allowed?: boolean | null
          id?: string
          internalnotes?: string | null
          large_project_id?: string | null
          last_calendar_sync?: string | null
          map_drawing_url?: string | null
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
        Relationships: [
          {
            foreignKeyName: "bookings_large_project_id_fkey"
            columns: ["large_project_id"]
            isOneToOne: false
            referencedRelation: "large_projects"
            referencedColumns: ["id"]
          },
        ]
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
      establishment_subtasks: {
        Row: {
          assigned_to: string | null
          booking_id: string
          completed: boolean
          created_at: string
          description: string | null
          end_time: string | null
          id: string
          notes: string | null
          parent_task_id: string
          sort_order: number
          start_time: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          booking_id: string
          completed?: boolean
          created_at?: string
          description?: string | null
          end_time?: string | null
          id?: string
          notes?: string | null
          parent_task_id: string
          sort_order?: number
          start_time?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          booking_id?: string
          completed?: boolean
          created_at?: string
          description?: string | null
          end_time?: string | null
          id?: string
          notes?: string | null
          parent_task_id?: string
          sort_order?: number
          start_time?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "establishment_subtasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      job_completion_analytics: {
        Row: {
          booking_id: string
          booking_number: string | null
          carry_more_than_10m: boolean | null
          client_name: string
          completed_at: string
          created_at: string
          delivery_address: string | null
          delivery_city: string | null
          event_date: string | null
          exact_time_required: boolean | null
          ground_nails_allowed: boolean | null
          id: string
          margin_percentage: number | null
          product_categories: Json | null
          project_id: string | null
          rig_date: string | null
          rigdown_date: string | null
          staff_assignments: Json | null
          total_external_cost: number | null
          total_hours_worked: number | null
          total_labor_cost: number | null
          total_margin: number | null
          total_material_cost: number | null
          total_overtime_hours: number | null
          total_product_value: number | null
          total_products: number | null
          total_purchases: number | null
          total_revenue: number | null
          total_setup_hours_estimated: number | null
          total_staff_count: number | null
          updated_at: string
          warehouse_handling_cost: number | null
        }
        Insert: {
          booking_id: string
          booking_number?: string | null
          carry_more_than_10m?: boolean | null
          client_name: string
          completed_at?: string
          created_at?: string
          delivery_address?: string | null
          delivery_city?: string | null
          event_date?: string | null
          exact_time_required?: boolean | null
          ground_nails_allowed?: boolean | null
          id?: string
          margin_percentage?: number | null
          product_categories?: Json | null
          project_id?: string | null
          rig_date?: string | null
          rigdown_date?: string | null
          staff_assignments?: Json | null
          total_external_cost?: number | null
          total_hours_worked?: number | null
          total_labor_cost?: number | null
          total_margin?: number | null
          total_material_cost?: number | null
          total_overtime_hours?: number | null
          total_product_value?: number | null
          total_products?: number | null
          total_purchases?: number | null
          total_revenue?: number | null
          total_setup_hours_estimated?: number | null
          total_staff_count?: number | null
          updated_at?: string
          warehouse_handling_cost?: number | null
        }
        Update: {
          booking_id?: string
          booking_number?: string | null
          carry_more_than_10m?: boolean | null
          client_name?: string
          completed_at?: string
          created_at?: string
          delivery_address?: string | null
          delivery_city?: string | null
          event_date?: string | null
          exact_time_required?: boolean | null
          ground_nails_allowed?: boolean | null
          id?: string
          margin_percentage?: number | null
          product_categories?: Json | null
          project_id?: string | null
          rig_date?: string | null
          rigdown_date?: string | null
          staff_assignments?: Json | null
          total_external_cost?: number | null
          total_hours_worked?: number | null
          total_labor_cost?: number | null
          total_margin?: number | null
          total_material_cost?: number | null
          total_overtime_hours?: number | null
          total_product_value?: number | null
          total_products?: number | null
          total_purchases?: number | null
          total_revenue?: number | null
          total_setup_hours_estimated?: number | null
          total_staff_count?: number | null
          updated_at?: string
          warehouse_handling_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_completion_analytics_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      job_staff_assignments: {
        Row: {
          assignment_date: string
          created_at: string
          id: string
          job_id: string
          staff_id: string
        }
        Insert: {
          assignment_date: string
          created_at?: string
          id?: string
          job_id: string
          staff_id: string
        }
        Update: {
          assignment_date?: string
          created_at?: string
          id?: string
          job_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_staff_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_staff_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      large_project_bookings: {
        Row: {
          booking_id: string
          created_at: string
          display_name: string | null
          id: string
          large_project_id: string
          sort_order: number | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          large_project_id: string
          sort_order?: number | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          large_project_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "large_project_bookings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "large_project_bookings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "confirmed_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "large_project_bookings_large_project_id_fkey"
            columns: ["large_project_id"]
            isOneToOne: false
            referencedRelation: "large_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      large_project_budget: {
        Row: {
          budgeted_hours: number | null
          created_at: string
          description: string | null
          hourly_rate: number | null
          id: string
          large_project_id: string
          updated_at: string
        }
        Insert: {
          budgeted_hours?: number | null
          created_at?: string
          description?: string | null
          hourly_rate?: number | null
          id?: string
          large_project_id: string
          updated_at?: string
        }
        Update: {
          budgeted_hours?: number | null
          created_at?: string
          description?: string | null
          hourly_rate?: number | null
          id?: string
          large_project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "large_project_budget_large_project_id_fkey"
            columns: ["large_project_id"]
            isOneToOne: true
            referencedRelation: "large_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      large_project_comments: {
        Row: {
          author_name: string
          content: string
          created_at: string
          id: string
          large_project_id: string
        }
        Insert: {
          author_name: string
          content: string
          created_at?: string
          id?: string
          large_project_id: string
        }
        Update: {
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          large_project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "large_project_comments_large_project_id_fkey"
            columns: ["large_project_id"]
            isOneToOne: false
            referencedRelation: "large_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      large_project_files: {
        Row: {
          file_name: string
          file_type: string | null
          id: string
          large_project_id: string
          uploaded_at: string
          uploaded_by: string | null
          url: string
        }
        Insert: {
          file_name: string
          file_type?: string | null
          id?: string
          large_project_id: string
          uploaded_at?: string
          uploaded_by?: string | null
          url: string
        }
        Update: {
          file_name?: string
          file_type?: string | null
          id?: string
          large_project_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "large_project_files_large_project_id_fkey"
            columns: ["large_project_id"]
            isOneToOne: false
            referencedRelation: "large_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      large_project_gantt_steps: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_milestone: boolean | null
          large_project_id: string
          sort_order: number
          start_date: string | null
          step_key: string
          step_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_milestone?: boolean | null
          large_project_id: string
          sort_order?: number
          start_date?: string | null
          step_key: string
          step_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_milestone?: boolean | null
          large_project_id?: string
          sort_order?: number
          start_date?: string | null
          step_key?: string
          step_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "large_project_gantt_steps_large_project_id_fkey"
            columns: ["large_project_id"]
            isOneToOne: false
            referencedRelation: "large_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      large_project_purchases: {
        Row: {
          amount: number | null
          category: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          large_project_id: string
          purchase_date: string | null
          receipt_url: string | null
          supplier: string | null
        }
        Insert: {
          amount?: number | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          large_project_id: string
          purchase_date?: string | null
          receipt_url?: string | null
          supplier?: string | null
        }
        Update: {
          amount?: number | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          large_project_id?: string
          purchase_date?: string | null
          receipt_url?: string | null
          supplier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "large_project_purchases_large_project_id_fkey"
            columns: ["large_project_id"]
            isOneToOne: false
            referencedRelation: "large_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      large_project_tasks: {
        Row: {
          assigned_to: string | null
          completed: boolean | null
          created_at: string
          deadline: string | null
          description: string | null
          id: string
          is_info_only: boolean | null
          large_project_id: string
          sort_order: number | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed?: boolean | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          is_info_only?: boolean | null
          large_project_id: string
          sort_order?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed?: boolean | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          is_info_only?: boolean | null
          large_project_id?: string
          sort_order?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "large_project_tasks_large_project_id_fkey"
            columns: ["large_project_id"]
            isOneToOne: false
            referencedRelation: "large_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      large_projects: {
        Row: {
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          location: string | null
          name: string
          project_leader: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          name: string
          project_leader?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          name?: string
          project_leader?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      packing_budget: {
        Row: {
          budgeted_hours: number
          created_at: string
          description: string | null
          hourly_rate: number
          id: string
          packing_id: string
          updated_at: string
        }
        Insert: {
          budgeted_hours?: number
          created_at?: string
          description?: string | null
          hourly_rate?: number
          id?: string
          packing_id: string
          updated_at?: string
        }
        Update: {
          budgeted_hours?: number
          created_at?: string
          description?: string | null
          hourly_rate?: number
          id?: string
          packing_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_budget_packing_id_fkey"
            columns: ["packing_id"]
            isOneToOne: true
            referencedRelation: "packing_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_comments: {
        Row: {
          author_name: string
          content: string
          created_at: string
          id: string
          packing_id: string
        }
        Insert: {
          author_name: string
          content: string
          created_at?: string
          id?: string
          packing_id: string
        }
        Update: {
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          packing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_comments_packing_id_fkey"
            columns: ["packing_id"]
            isOneToOne: false
            referencedRelation: "packing_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_files: {
        Row: {
          file_name: string
          file_type: string | null
          id: string
          packing_id: string
          uploaded_at: string
          uploaded_by: string | null
          url: string
        }
        Insert: {
          file_name: string
          file_type?: string | null
          id?: string
          packing_id: string
          uploaded_at?: string
          uploaded_by?: string | null
          url: string
        }
        Update: {
          file_name?: string
          file_type?: string | null
          id?: string
          packing_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_files_packing_id_fkey"
            columns: ["packing_id"]
            isOneToOne: false
            referencedRelation: "packing_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_invoices: {
        Row: {
          created_at: string
          due_date: string | null
          id: string
          invoice_date: string | null
          invoice_file_url: string | null
          invoice_number: string | null
          invoiced_amount: number
          notes: string | null
          packing_id: string
          quote_id: string | null
          status: string
          supplier: string
        }
        Insert: {
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          invoice_file_url?: string | null
          invoice_number?: string | null
          invoiced_amount?: number
          notes?: string | null
          packing_id: string
          quote_id?: string | null
          status?: string
          supplier: string
        }
        Update: {
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          invoice_file_url?: string | null
          invoice_number?: string | null
          invoiced_amount?: number
          notes?: string | null
          packing_id?: string
          quote_id?: string | null
          status?: string
          supplier?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_invoices_packing_id_fkey"
            columns: ["packing_id"]
            isOneToOne: false
            referencedRelation: "packing_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "packing_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_labor_costs: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          hourly_rate: number
          hours: number
          id: string
          packing_id: string
          staff_id: string | null
          staff_name: string
          work_date: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          hourly_rate?: number
          hours?: number
          id?: string
          packing_id: string
          staff_id?: string | null
          staff_name: string
          work_date?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          hourly_rate?: number
          hours?: number
          id?: string
          packing_id?: string
          staff_id?: string | null
          staff_name?: string
          work_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packing_labor_costs_packing_id_fkey"
            columns: ["packing_id"]
            isOneToOne: false
            referencedRelation: "packing_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_labor_costs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_list_items: {
        Row: {
          booking_product_id: string
          created_at: string
          id: string
          notes: string | null
          packed_at: string | null
          packed_by: string | null
          packing_id: string
          parcel_id: string | null
          quantity_packed: number
          quantity_to_pack: number
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          booking_product_id: string
          created_at?: string
          id?: string
          notes?: string | null
          packed_at?: string | null
          packed_by?: string | null
          packing_id: string
          parcel_id?: string | null
          quantity_packed?: number
          quantity_to_pack?: number
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          booking_product_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          packed_at?: string | null
          packed_by?: string | null
          packing_id?: string
          parcel_id?: string | null
          quantity_packed?: number
          quantity_to_pack?: number
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packing_list_items_booking_product_id_fkey"
            columns: ["booking_product_id"]
            isOneToOne: false
            referencedRelation: "booking_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_list_items_packing_id_fkey"
            columns: ["packing_id"]
            isOneToOne: false
            referencedRelation: "packing_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_list_items_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "packing_parcels"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_parcels: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          packing_id: string
          parcel_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          packing_id: string
          parcel_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          packing_id?: string
          parcel_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "packing_parcels_packing_id_fkey"
            columns: ["packing_id"]
            isOneToOne: false
            referencedRelation: "packing_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_projects: {
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
        Relationships: []
      }
      packing_purchases: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          packing_id: string
          purchase_date: string | null
          receipt_url: string | null
          supplier: string | null
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          packing_id: string
          purchase_date?: string | null
          receipt_url?: string | null
          supplier?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          packing_id?: string
          purchase_date?: string | null
          receipt_url?: string | null
          supplier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packing_purchases_packing_id_fkey"
            columns: ["packing_id"]
            isOneToOne: false
            referencedRelation: "packing_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_quotes: {
        Row: {
          created_at: string
          description: string
          id: string
          packing_id: string
          quote_date: string | null
          quote_file_url: string | null
          quoted_amount: number
          status: string
          supplier: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          packing_id: string
          quote_date?: string | null
          quote_file_url?: string | null
          quoted_amount?: number
          status?: string
          supplier: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          packing_id?: string
          quote_date?: string | null
          quote_file_url?: string | null
          quoted_amount?: number
          status?: string
          supplier?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packing_quotes_packing_id_fkey"
            columns: ["packing_id"]
            isOneToOne: false
            referencedRelation: "packing_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_task_comments: {
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
            foreignKeyName: "packing_task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "packing_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_tasks: {
        Row: {
          assigned_to: string | null
          completed: boolean
          created_at: string
          deadline: string | null
          description: string | null
          id: string
          is_info_only: boolean | null
          packing_id: string
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
          packing_id: string
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
          packing_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_tasks_packing_id_fkey"
            columns: ["packing_id"]
            isOneToOne: false
            referencedRelation: "packing_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          organization_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          organization_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          organization_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      project_activity_log: {
        Row: {
          action: string
          created_at: string
          description: string
          id: string
          metadata: Json | null
          performed_by: string | null
          project_id: string
        }
        Insert: {
          action: string
          created_at?: string
          description: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          project_id: string
        }
        Update: {
          action?: string
          created_at?: string
          description?: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_activity_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_budget: {
        Row: {
          budgeted_hours: number
          created_at: string
          description: string | null
          hourly_rate: number
          id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          budgeted_hours?: number
          created_at?: string
          description?: string | null
          hourly_rate?: number
          id?: string
          project_id: string
          updated_at?: string
        }
        Update: {
          budgeted_hours?: number
          created_at?: string
          description?: string | null
          hourly_rate?: number
          id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_budget_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
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
      project_invoices: {
        Row: {
          created_at: string
          due_date: string | null
          id: string
          invoice_date: string | null
          invoice_file_url: string | null
          invoice_number: string | null
          invoiced_amount: number
          notes: string | null
          project_id: string
          quote_id: string | null
          status: string
          supplier: string
        }
        Insert: {
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          invoice_file_url?: string | null
          invoice_number?: string | null
          invoiced_amount?: number
          notes?: string | null
          project_id: string
          quote_id?: string | null
          status?: string
          supplier: string
        }
        Update: {
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          invoice_file_url?: string | null
          invoice_number?: string | null
          invoiced_amount?: number
          notes?: string | null
          project_id?: string
          quote_id?: string | null
          status?: string
          supplier?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "project_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      project_labor_costs: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          hourly_rate: number
          hours: number
          id: string
          project_id: string
          staff_id: string | null
          staff_name: string
          work_date: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          hourly_rate?: number
          hours?: number
          id?: string
          project_id: string
          staff_id?: string | null
          staff_name: string
          work_date?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          hourly_rate?: number
          hours?: number
          id?: string
          project_id?: string
          staff_id?: string | null
          staff_name?: string
          work_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_labor_costs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_labor_costs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      project_purchases: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          project_id: string
          purchase_date: string | null
          receipt_url: string | null
          supplier: string | null
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          project_id: string
          purchase_date?: string | null
          receipt_url?: string | null
          supplier?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          project_id?: string
          purchase_date?: string | null
          receipt_url?: string | null
          supplier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_purchases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_quotes: {
        Row: {
          created_at: string
          description: string
          id: string
          project_id: string
          quote_date: string | null
          quote_file_url: string | null
          quoted_amount: number
          status: string
          supplier: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          project_id: string
          quote_date?: string | null
          quote_file_url?: string | null
          quoted_amount?: number
          status?: string
          supplier: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          project_id?: string
          quote_date?: string | null
          quote_file_url?: string | null
          quoted_amount?: number
          status?: string
          supplier?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_quotes_project_id_fkey"
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
      staff_job_affinity: {
        Row: {
          affinity_score: number | null
          avg_efficiency_score: number | null
          created_at: string
          id: string
          jobs_completed: number | null
          last_job_date: string | null
          product_category: string
          staff_id: string
          staff_name: string
          total_hours_on_category: number | null
          updated_at: string
        }
        Insert: {
          affinity_score?: number | null
          avg_efficiency_score?: number | null
          created_at?: string
          id?: string
          jobs_completed?: number | null
          last_job_date?: string | null
          product_category: string
          staff_id: string
          staff_name: string
          total_hours_on_category?: number | null
          updated_at?: string
        }
        Update: {
          affinity_score?: number | null
          avg_efficiency_score?: number | null
          created_at?: string
          id?: string
          jobs_completed?: number | null
          last_job_date?: string | null
          product_category?: string
          staff_id?: string
          staff_name?: string
          total_hours_on_category?: number | null
          updated_at?: string
        }
        Relationships: []
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
          approved: boolean | null
          approved_at: string | null
          approved_by: string | null
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
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
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
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
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
      transport_assignments: {
        Row: {
          actual_arrival: string | null
          booking_id: string
          created_at: string
          driver_notes: string | null
          estimated_arrival: string | null
          estimated_duration: number | null
          id: string
          partner_responded_at: string | null
          partner_response: string | null
          partner_response_token: string | null
          pickup_address: string | null
          pickup_latitude: number | null
          pickup_longitude: number | null
          status: string | null
          stop_order: number | null
          transport_date: string
          transport_time: string | null
          vehicle_id: string
        }
        Insert: {
          actual_arrival?: string | null
          booking_id: string
          created_at?: string
          driver_notes?: string | null
          estimated_arrival?: string | null
          estimated_duration?: number | null
          id?: string
          partner_responded_at?: string | null
          partner_response?: string | null
          partner_response_token?: string | null
          pickup_address?: string | null
          pickup_latitude?: number | null
          pickup_longitude?: number | null
          status?: string | null
          stop_order?: number | null
          transport_date: string
          transport_time?: string | null
          vehicle_id: string
        }
        Update: {
          actual_arrival?: string | null
          booking_id?: string
          created_at?: string
          driver_notes?: string | null
          estimated_arrival?: string | null
          estimated_duration?: number | null
          id?: string
          partner_responded_at?: string | null
          partner_response?: string | null
          partner_response_token?: string | null
          pickup_address?: string | null
          pickup_latitude?: number | null
          pickup_longitude?: number | null
          status?: string | null
          stop_order?: number | null
          transport_date?: string
          transport_time?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "confirmed_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_assignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_email_log: {
        Row: {
          assignment_id: string
          booking_id: string
          custom_message: string | null
          email_type: string
          id: string
          recipient_email: string
          recipient_name: string | null
          sent_at: string
          sent_by: string | null
          subject: string
        }
        Insert: {
          assignment_id: string
          booking_id: string
          custom_message?: string | null
          email_type?: string
          id?: string
          recipient_email: string
          recipient_name?: string | null
          sent_at?: string
          sent_by?: string | null
          subject: string
        }
        Update: {
          assignment_id?: string
          booking_id?: string
          custom_message?: string | null
          email_type?: string
          id?: string
          recipient_email?: string
          recipient_name?: string | null
          sent_at?: string
          sent_by?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_email_log_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "transport_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_gps_history: {
        Row: {
          heading: number | null
          id: string
          lat: number
          lng: number
          recorded_at: string
          speed_kmh: number | null
          vehicle_id: string
        }
        Insert: {
          heading?: number | null
          id?: string
          lat: number
          lng: number
          recorded_at?: string
          speed_kmh?: number | null
          vehicle_id: string
        }
        Update: {
          heading?: number | null
          id?: string
          lat?: number
          lng?: number
          recorded_at?: string
          speed_kmh?: number | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_gps_history_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          assigned_driver_id: string | null
          company_name: string | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          crane_capacity_ton: number | null
          crane_reach_m: number | null
          created_at: string
          current_heading: number | null
          current_lat: number | null
          current_lng: number | null
          daily_rate: number | null
          hourly_rate: number | null
          id: string
          is_active: boolean | null
          is_external: boolean
          last_gps_update: string | null
          max_volume_m3: number | null
          max_weight_kg: number | null
          name: string
          notes: string | null
          provided_vehicle_types: string[] | null
          registration_number: string | null
          updated_at: string
          vehicle_height_m: number | null
          vehicle_length_m: number | null
          vehicle_type: string | null
          vehicle_type_rates: Json | null
          vehicle_width_m: number | null
        }
        Insert: {
          assigned_driver_id?: string | null
          company_name?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          crane_capacity_ton?: number | null
          crane_reach_m?: number | null
          created_at?: string
          current_heading?: number | null
          current_lat?: number | null
          current_lng?: number | null
          daily_rate?: number | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          is_external?: boolean
          last_gps_update?: string | null
          max_volume_m3?: number | null
          max_weight_kg?: number | null
          name: string
          notes?: string | null
          provided_vehicle_types?: string[] | null
          registration_number?: string | null
          updated_at?: string
          vehicle_height_m?: number | null
          vehicle_length_m?: number | null
          vehicle_type?: string | null
          vehicle_type_rates?: Json | null
          vehicle_width_m?: number | null
        }
        Update: {
          assigned_driver_id?: string | null
          company_name?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          crane_capacity_ton?: number | null
          crane_reach_m?: number | null
          created_at?: string
          current_heading?: number | null
          current_lat?: number | null
          current_lng?: number | null
          daily_rate?: number | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          is_external?: boolean
          last_gps_update?: string | null
          max_volume_m3?: number | null
          max_weight_kg?: number | null
          name?: string
          notes?: string | null
          provided_vehicle_types?: string[] | null
          registration_number?: string | null
          updated_at?: string
          vehicle_height_m?: number | null
          vehicle_length_m?: number | null
          vehicle_type?: string | null
          vehicle_type_rates?: Json | null
          vehicle_width_m?: number | null
        }
        Relationships: []
      }
      warehouse_calendar_events: {
        Row: {
          booking_id: string | null
          booking_number: string | null
          change_details: string | null
          created_at: string | null
          delivery_address: string | null
          end_time: string
          event_type: string
          has_source_changes: boolean | null
          id: string
          manually_adjusted: boolean | null
          resource_id: string
          source_event_date: string | null
          source_rig_date: string | null
          source_rigdown_date: string | null
          start_time: string
          title: string
          updated_at: string | null
          viewed: boolean | null
        }
        Insert: {
          booking_id?: string | null
          booking_number?: string | null
          change_details?: string | null
          created_at?: string | null
          delivery_address?: string | null
          end_time: string
          event_type: string
          has_source_changes?: boolean | null
          id?: string
          manually_adjusted?: boolean | null
          resource_id?: string
          source_event_date?: string | null
          source_rig_date?: string | null
          source_rigdown_date?: string | null
          start_time: string
          title: string
          updated_at?: string | null
          viewed?: boolean | null
        }
        Update: {
          booking_id?: string | null
          booking_number?: string | null
          change_details?: string | null
          created_at?: string | null
          delivery_address?: string | null
          end_time?: string
          event_type?: string
          has_source_changes?: boolean | null
          id?: string
          manually_adjusted?: boolean | null
          resource_id?: string
          source_event_date?: string | null
          source_rig_date?: string | null
          source_rigdown_date?: string | null
          start_time?: string
          title?: string
          updated_at?: string | null
          viewed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_calendar_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_calendar_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "confirmed_bookings"
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
      has_planning_access: { Args: { _user_id?: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id?: string
        }
        Returns: boolean
      }
      jsonb_object_keys_array: { Args: { j: Json }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "forsaljning" | "projekt" | "lager"
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
      app_role: ["admin", "forsaljning", "projekt", "lager"],
      availability_type: ["available", "unavailable", "blocked"],
    },
  },
} as const
