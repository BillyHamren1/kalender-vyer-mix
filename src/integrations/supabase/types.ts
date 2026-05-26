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
      _backup_projects_phase_dates_20260515: {
        Row: {
          booking_id: string | null
          eventdate: string | null
          organization_id: string | null
          project_id: string | null
          rigdaydate: string | null
          rigdowndate: string | null
          snapshot_taken_at: string | null
          updated_at: string | null
        }
        Insert: {
          booking_id?: string | null
          eventdate?: string | null
          organization_id?: string | null
          project_id?: string | null
          rigdaydate?: string | null
          rigdowndate?: string | null
          snapshot_taken_at?: string | null
          updated_at?: string | null
        }
        Update: {
          booking_id?: string | null
          eventdate?: string | null
          organization_id?: string | null
          project_id?: string | null
          rigdaydate?: string | null
          rigdowndate?: string | null
          snapshot_taken_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      active_time_registrations: {
        Row: {
          auto_started: boolean
          created_at: string
          current_confidence: number | null
          current_kind: string | null
          current_label: string | null
          current_target_id: string | null
          current_target_type: string | null
          id: string
          manual_override_kind: string | null
          manual_override_label: string | null
          manual_override_target_id: string | null
          manual_override_target_type: string | null
          metadata: Json
          needs_user_choice: boolean
          organization_id: string
          staff_id: string
          start_source: string
          start_target_id: string | null
          start_target_label: string | null
          start_target_type: string | null
          started_at: string
          started_by: string | null
          status: string
          stop_source: string | null
          stopped_at: string | null
          stopped_by: string | null
          updated_at: string
        }
        Insert: {
          auto_started?: boolean
          created_at?: string
          current_confidence?: number | null
          current_kind?: string | null
          current_label?: string | null
          current_target_id?: string | null
          current_target_type?: string | null
          id?: string
          manual_override_kind?: string | null
          manual_override_label?: string | null
          manual_override_target_id?: string | null
          manual_override_target_type?: string | null
          metadata?: Json
          needs_user_choice?: boolean
          organization_id: string
          staff_id: string
          start_source: string
          start_target_id?: string | null
          start_target_label?: string | null
          start_target_type?: string | null
          started_at: string
          started_by?: string | null
          status: string
          stop_source?: string | null
          stopped_at?: string | null
          stopped_by?: string | null
          updated_at?: string
        }
        Update: {
          auto_started?: boolean
          created_at?: string
          current_confidence?: number | null
          current_kind?: string | null
          current_label?: string | null
          current_target_id?: string | null
          current_target_type?: string | null
          id?: string
          manual_override_kind?: string | null
          manual_override_label?: string | null
          manual_override_target_id?: string | null
          manual_override_target_type?: string | null
          metadata?: Json
          needs_user_choice?: boolean
          organization_id?: string
          staff_id?: string
          start_source?: string
          start_target_id?: string | null
          start_target_label?: string | null
          start_target_type?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          stop_source?: string | null
          stopped_at?: string | null
          stopped_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      actual_day_event_overrides: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          event_key: string
          id: string
          local_date: string
          organization_id: string
          reason: string
          staff_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          created_by?: string | null
          event_key: string
          id?: string
          local_date: string
          organization_id: string
          reason?: string
          staff_id: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          event_key?: string
          id?: string
          local_date?: string
          organization_id?: string
          reason?: string
          staff_id?: string
        }
        Relationships: []
      }
      ai_reality_corrections: {
        Row: {
          ai_model: string | null
          ai_reasoning: string
          applied_actions: Json
          applied_at: string | null
          confidence: number
          created_at: string
          detected_at: string
          id: string
          organization_id: string
          push_response: string | null
          push_sent_at: string | null
          reverted_at: string | null
          reverted_by: string | null
          situation_kind: string
          situation_snapshot: Json
          staff_id: string
          status: string
          suggested_actions: Json
          updated_at: string
        }
        Insert: {
          ai_model?: string | null
          ai_reasoning?: string
          applied_actions?: Json
          applied_at?: string | null
          confidence: number
          created_at?: string
          detected_at?: string
          id?: string
          organization_id: string
          push_response?: string | null
          push_sent_at?: string | null
          reverted_at?: string | null
          reverted_by?: string | null
          situation_kind: string
          situation_snapshot?: Json
          staff_id: string
          status?: string
          suggested_actions?: Json
          updated_at?: string
        }
        Update: {
          ai_model?: string | null
          ai_reasoning?: string
          applied_actions?: Json
          applied_at?: string | null
          confidence?: number
          created_at?: string
          detected_at?: string
          id?: string
          organization_id?: string
          push_response?: string | null
          push_sent_at?: string | null
          reverted_at?: string | null
          reverted_by?: string | null
          situation_kind?: string
          situation_snapshot?: Json
          staff_id?: string
          status?: string
          suggested_actions?: Json
          updated_at?: string
        }
        Relationships: []
      }
      ai_time_review_runs: {
        Row: {
          auto_applied_count: number
          confidence: number | null
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          input_signature: string | null
          model: string | null
          organization_id: string
          reasoning: string | null
          report_date: string
          rules_learned: string[]
          rules_used: string[]
          staff_id: string
          suggestions_created: number
          trigger_source: string
          triggered_by: string | null
          verdict: string
        }
        Insert: {
          auto_applied_count?: number
          confidence?: number | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input_signature?: string | null
          model?: string | null
          organization_id: string
          reasoning?: string | null
          report_date: string
          rules_learned?: string[]
          rules_used?: string[]
          staff_id: string
          suggestions_created?: number
          trigger_source: string
          triggered_by?: string | null
          verdict: string
        }
        Update: {
          auto_applied_count?: number
          confidence?: number | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input_signature?: string | null
          model?: string | null
          organization_id?: string
          reasoning?: string | null
          report_date?: string
          rules_learned?: string[]
          rules_used?: string[]
          staff_id?: string
          suggestions_created?: number
          trigger_source?: string
          triggered_by?: string | null
          verdict?: string
        }
        Relationships: []
      }
      arrival_context_suggestions: {
        Row: {
          confidence: number
          created_at: string
          decided_at: string | null
          decision: string | null
          id: string
          kind: string
          lat: number
          lng: number
          organization_id: string
          payload: Json
          staff_id: string
          travel_log_id: string | null
        }
        Insert: {
          confidence?: number
          created_at?: string
          decided_at?: string | null
          decision?: string | null
          id?: string
          kind: string
          lat: number
          lng: number
          organization_id: string
          payload?: Json
          staff_id: string
          travel_log_id?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string
          decided_at?: string | null
          decision?: string | null
          id?: string
          kind?: string
          lat?: number
          lng?: number
          organization_id?: string
          payload?: Json
          staff_id?: string
          travel_log_id?: string | null
        }
        Relationships: []
      }
      arrival_prompt_log: {
        Row: {
          arrived_at: string
          created_at: string
          id: string
          last_prompt_at: string | null
          location_id: string | null
          organization_id: string
          prompt_count: number
          resolved: boolean
          resolved_at: string | null
          staff_id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          arrived_at: string
          created_at?: string
          id?: string
          last_prompt_at?: string | null
          location_id?: string | null
          organization_id: string
          prompt_count?: number
          resolved?: boolean
          resolved_at?: string | null
          staff_id: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          arrived_at?: string
          created_at?: string
          id?: string
          last_prompt_at?: string | null
          location_id?: string | null
          organization_id?: string
          prompt_count?: number
          resolved?: boolean
          resolved_at?: string | null
          staff_id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      assistant_events: {
        Row: {
          created_at: string
          dedupe_key: string | null
          detected_at: string
          event_type: Database["public"]["Enums"]["assistant_event_type"]
          happened_at: string
          id: string
          linked_time_report_id: string | null
          linked_travel_log_id: string | null
          linked_workday_id: string | null
          merged_into_event_id: string | null
          metadata: Json
          organization_id: string
          resolution_notes: string | null
          resolution_status: Database["public"]["Enums"]["assistant_event_resolution"]
          resolved_at: string | null
          resolved_by: string | null
          source: Database["public"]["Enums"]["assistant_event_source"]
          staff_id: string
          stale_for_prompt: boolean
          still_relevant_for_review: boolean
          suggested_action: Database["public"]["Enums"]["assistant_event_suggested_action"]
          target_address: string | null
          target_id: string | null
          target_label: string | null
          target_type: Database["public"]["Enums"]["assistant_event_target_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          detected_at?: string
          event_type: Database["public"]["Enums"]["assistant_event_type"]
          happened_at: string
          id?: string
          linked_time_report_id?: string | null
          linked_travel_log_id?: string | null
          linked_workday_id?: string | null
          merged_into_event_id?: string | null
          metadata?: Json
          organization_id: string
          resolution_notes?: string | null
          resolution_status?: Database["public"]["Enums"]["assistant_event_resolution"]
          resolved_at?: string | null
          resolved_by?: string | null
          source?: Database["public"]["Enums"]["assistant_event_source"]
          staff_id: string
          stale_for_prompt?: boolean
          still_relevant_for_review?: boolean
          suggested_action?: Database["public"]["Enums"]["assistant_event_suggested_action"]
          target_address?: string | null
          target_id?: string | null
          target_label?: string | null
          target_type: Database["public"]["Enums"]["assistant_event_target_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          detected_at?: string
          event_type?: Database["public"]["Enums"]["assistant_event_type"]
          happened_at?: string
          id?: string
          linked_time_report_id?: string | null
          linked_travel_log_id?: string | null
          linked_workday_id?: string | null
          merged_into_event_id?: string | null
          metadata?: Json
          organization_id?: string
          resolution_notes?: string | null
          resolution_status?: Database["public"]["Enums"]["assistant_event_resolution"]
          resolved_at?: string | null
          resolved_by?: string | null
          source?: Database["public"]["Enums"]["assistant_event_source"]
          staff_id?: string
          stale_for_prompt?: boolean
          still_relevant_for_review?: boolean
          suggested_action?: Database["public"]["Enums"]["assistant_event_suggested_action"]
          target_address?: string | null
          target_id?: string | null
          target_label?: string | null
          target_type?: Database["public"]["Enums"]["assistant_event_target_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_events_merged_into_event_id_fkey"
            columns: ["merged_into_event_id"]
            isOneToOne: false
            referencedRelation: "assistant_events"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_start_decline_log: {
        Row: {
          created_at: string
          day_scope: boolean
          declined_at: string
          expires_at: string
          id: string
          lat: number | null
          lng: number | null
          local_date: string
          metadata: Json
          organization_id: string
          radius_m: number | null
          response: string
          source: string
          staff_id: string
          target_id: string | null
          target_label: string | null
          target_type: string | null
        }
        Insert: {
          created_at?: string
          day_scope?: boolean
          declined_at?: string
          expires_at: string
          id?: string
          lat?: number | null
          lng?: number | null
          local_date: string
          metadata?: Json
          organization_id: string
          radius_m?: number | null
          response?: string
          source?: string
          staff_id: string
          target_id?: string | null
          target_label?: string | null
          target_type?: string | null
        }
        Update: {
          created_at?: string
          day_scope?: boolean
          declined_at?: string
          expires_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          local_date?: string
          metadata?: Json
          organization_id?: string
          radius_m?: number | null
          response?: string
          source?: string
          staff_id?: string
          target_id?: string | null
          target_label?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      booking_attachments: {
        Row: {
          booking_id: string
          file_name: string | null
          file_type: string | null
          id: string
          organization_id: string
          source: string
          uploaded_at: string
          url: string
        }
        Insert: {
          booking_id: string
          file_name?: string | null
          file_type?: string | null
          id?: string
          organization_id?: string
          source?: string
          uploaded_at?: string
          url: string
        }
        Update: {
          booking_id?: string
          file_name?: string | null
          file_type?: string | null
          id?: string
          organization_id?: string
          source?: string
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
          {
            foreignKeyName: "booking_attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_change_views: {
        Row: {
          booking_id: string
          last_seen_at: string
          user_id: string
        }
        Insert: {
          booking_id: string
          last_seen_at?: string
          user_id: string
        }
        Update: {
          booking_id?: string
          last_seen_at?: string
          user_id?: string
        }
        Relationships: []
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
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
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
          {
            foreignKeyName: "booking_changes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_import_audit: {
        Row: {
          action: string
          booking_id: string
          booking_number: string | null
          created_at: string
          external_organization_id: string | null
          id: string
          org_match: boolean
          request_organization_id: string
          resolved_organization_id: string
          source: string
        }
        Insert: {
          action?: string
          booking_id: string
          booking_number?: string | null
          created_at?: string
          external_organization_id?: string | null
          id?: string
          org_match?: boolean
          request_organization_id: string
          resolved_organization_id: string
          source?: string
        }
        Update: {
          action?: string
          booking_id?: string
          booking_number?: string | null
          created_at?: string
          external_organization_id?: string | null
          id?: string
          org_match?: boolean
          request_organization_id?: string
          resolved_organization_id?: string
          source?: string
        }
        Relationships: []
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
          local_tags: string[]
          material_cost: number | null
          name: string
          notes: string | null
          organization_id: string
          package_components: Json | null
          parent_package_id: string | null
          parent_product_id: string | null
          purchase_cost: number | null
          quantity: number
          setup_hours: number | null
          sku: string | null
          sort_index: number | null
          tags: string[] | null
          tags_en: string[] | null
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
          local_tags?: string[]
          material_cost?: number | null
          name: string
          notes?: string | null
          organization_id?: string
          package_components?: Json | null
          parent_package_id?: string | null
          parent_product_id?: string | null
          purchase_cost?: number | null
          quantity?: number
          setup_hours?: number | null
          sku?: string | null
          sort_index?: number | null
          tags?: string[] | null
          tags_en?: string[] | null
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
          local_tags?: string[]
          material_cost?: number | null
          name?: string
          notes?: string | null
          organization_id?: string
          package_components?: Json | null
          parent_package_id?: string | null
          parent_product_id?: string | null
          purchase_cost?: number | null
          quantity?: number
          setup_hours?: number | null
          sku?: string | null
          sort_index?: number | null
          tags?: string[] | null
          tags_en?: string[] | null
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
            foreignKeyName: "booking_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string
          role: string
          staff_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          assignment_date: string
          booking_id: string
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          staff_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          assignment_date?: string
          booking_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          staff_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_staff_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_sync_jobs: {
        Row: {
          attempts: number
          booking_id: string
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          max_attempts: number
          organization_id: string
          processed_at: string | null
          received_at: string
          started_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          booking_id: string
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          max_attempts?: number
          organization_id: string
          processed_at?: string | null
          received_at?: string
          started_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          booking_id?: string
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          max_attempts?: number
          organization_id?: string
          processed_at?: string | null
          received_at?: string
          started_at?: string | null
          status?: string
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
          customer_pickup: boolean
          delivery_city: string | null
          delivery_latitude: number | null
          delivery_longitude: number | null
          delivery_postal_code: string | null
          deliveryaddress: string | null
          economics_data: Json | null
          event_end_time: string | null
          event_end_time_external: string | null
          event_start_time: string | null
          event_start_time_external: string | null
          event_time_locked: boolean
          eventdate: string | null
          exact_time_info: string | null
          exact_time_needed: boolean | null
          ground_nails_allowed: boolean | null
          id: string
          internal_type: string | null
          internalnotes: string | null
          is_internal: boolean
          large_project_id: string | null
          last_calendar_sync: string | null
          map_drawing_url: string | null
          needs_review: boolean
          needs_review_reason: string | null
          organization_id: string
          rental_only: boolean
          rig_end_time: string | null
          rig_end_time_external: string | null
          rig_start_time: string | null
          rig_start_time_external: string | null
          rig_time_locked: boolean
          rigdaydate: string | null
          rigdown_end_time: string | null
          rigdown_end_time_external: string | null
          rigdown_start_time: string | null
          rigdown_start_time_external: string | null
          rigdown_time_locked: boolean
          rigdowndate: string | null
          status: string | null
          title: string | null
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
          customer_pickup?: boolean
          delivery_city?: string | null
          delivery_latitude?: number | null
          delivery_longitude?: number | null
          delivery_postal_code?: string | null
          deliveryaddress?: string | null
          economics_data?: Json | null
          event_end_time?: string | null
          event_end_time_external?: string | null
          event_start_time?: string | null
          event_start_time_external?: string | null
          event_time_locked?: boolean
          eventdate?: string | null
          exact_time_info?: string | null
          exact_time_needed?: boolean | null
          ground_nails_allowed?: boolean | null
          id: string
          internal_type?: string | null
          internalnotes?: string | null
          is_internal?: boolean
          large_project_id?: string | null
          last_calendar_sync?: string | null
          map_drawing_url?: string | null
          needs_review?: boolean
          needs_review_reason?: string | null
          organization_id?: string
          rental_only?: boolean
          rig_end_time?: string | null
          rig_end_time_external?: string | null
          rig_start_time?: string | null
          rig_start_time_external?: string | null
          rig_time_locked?: boolean
          rigdaydate?: string | null
          rigdown_end_time?: string | null
          rigdown_end_time_external?: string | null
          rigdown_start_time?: string | null
          rigdown_start_time_external?: string | null
          rigdown_time_locked?: boolean
          rigdowndate?: string | null
          status?: string | null
          title?: string | null
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
          customer_pickup?: boolean
          delivery_city?: string | null
          delivery_latitude?: number | null
          delivery_longitude?: number | null
          delivery_postal_code?: string | null
          deliveryaddress?: string | null
          economics_data?: Json | null
          event_end_time?: string | null
          event_end_time_external?: string | null
          event_start_time?: string | null
          event_start_time_external?: string | null
          event_time_locked?: boolean
          eventdate?: string | null
          exact_time_info?: string | null
          exact_time_needed?: boolean | null
          ground_nails_allowed?: boolean | null
          id?: string
          internal_type?: string | null
          internalnotes?: string | null
          is_internal?: boolean
          large_project_id?: string | null
          last_calendar_sync?: string | null
          map_drawing_url?: string | null
          needs_review?: boolean
          needs_review_reason?: string | null
          organization_id?: string
          rental_only?: boolean
          rig_end_time?: string | null
          rig_end_time_external?: string | null
          rig_start_time?: string | null
          rig_start_time_external?: string | null
          rig_time_locked?: boolean
          rigdaydate?: string | null
          rigdown_end_time?: string | null
          rigdown_end_time_external?: string | null
          rigdown_start_time?: string | null
          rigdown_start_time_external?: string | null
          rigdown_time_locked?: boolean
          rigdowndate?: string | null
          status?: string | null
          title?: string | null
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
          {
            foreignKeyName: "bookings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_messages: {
        Row: {
          audience: string
          audience_booking_id: string | null
          audience_staff_ids: string[] | null
          category: string
          content: string
          created_at: string
          id: string
          is_read_by: string[]
          organization_id: string
          sender_id: string
          sender_name: string
        }
        Insert: {
          audience?: string
          audience_booking_id?: string | null
          audience_staff_ids?: string[] | null
          category?: string
          content: string
          created_at?: string
          id?: string
          is_read_by?: string[]
          organization_id?: string
          sender_id: string
          sender_name: string
        }
        Update: {
          audience?: string
          audience_booking_id?: string | null
          audience_staff_ids?: string[] | null
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_read_by?: string[]
          organization_id?: string
          sender_id?: string
          sender_name?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          booking_id: string | null
          booking_number: string | null
          created_at: string
          customer_pickup: boolean
          delivery_address: string | null
          end_time: string
          event_type: string | null
          id: string
          organization_id: string
          resource_id: string
          source_date: string
          start_time: string
          times_locked: boolean
          title: string
          todo_id: string | null
          viewed: boolean | null
        }
        Insert: {
          booking_id?: string | null
          booking_number?: string | null
          created_at?: string
          customer_pickup?: boolean
          delivery_address?: string | null
          end_time: string
          event_type?: string | null
          id?: string
          organization_id?: string
          resource_id: string
          source_date: string
          start_time: string
          times_locked?: boolean
          title: string
          todo_id?: string | null
          viewed?: boolean | null
        }
        Update: {
          booking_id?: string | null
          booking_number?: string | null
          created_at?: string
          customer_pickup?: boolean
          delivery_address?: string | null
          end_time?: string
          event_type?: string | null
          id?: string
          organization_id?: string
          resource_id?: string
          source_date?: string
          start_time?: string
          times_locked?: boolean
          title?: string
          todo_id?: string | null
          viewed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_todo_id_fkey"
            columns: ["todo_id"]
            isOneToOne: false
            referencedRelation: "todos"
            referencedColumns: ["id"]
          },
        ]
      }
      completion_deviations: {
        Row: {
          completion_id: string
          created_at: string
          description: string | null
          deviation_type: string
          id: string
          impact_cost: number | null
          impact_hours: number | null
          impact_type: string | null
          organization_id: string
          related_product_id: string | null
          related_staff_id: string | null
        }
        Insert: {
          completion_id: string
          created_at?: string
          description?: string | null
          deviation_type: string
          id?: string
          impact_cost?: number | null
          impact_hours?: number | null
          impact_type?: string | null
          organization_id?: string
          related_product_id?: string | null
          related_staff_id?: string | null
        }
        Update: {
          completion_id?: string
          created_at?: string
          description?: string | null
          deviation_type?: string
          id?: string
          impact_cost?: number | null
          impact_hours?: number | null
          impact_type?: string | null
          organization_id?: string
          related_product_id?: string | null
          related_staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "completion_deviations_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "job_completion_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completion_deviations_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "v_derived_project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completion_deviations_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "v_product_project_matrix"
            referencedColumns: ["completion_id"]
          },
          {
            foreignKeyName: "completion_deviations_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "v_staff_project_matrix"
            referencedColumns: ["completion_id"]
          },
        ]
      }
      completion_products: {
        Row: {
          added_late: boolean | null
          booking_product_id: string | null
          category: string | null
          caused_deviation: boolean | null
          completion_id: string
          created_at: string
          deviation_type: string | null
          external_cost: number | null
          id: string
          is_package: boolean | null
          material_cost: number | null
          organization_id: string
          parent_package_name: string | null
          product_name: string
          quantity: number
          setup_hours: number | null
          sku: string | null
          total_price: number | null
          unit_price: number | null
        }
        Insert: {
          added_late?: boolean | null
          booking_product_id?: string | null
          category?: string | null
          caused_deviation?: boolean | null
          completion_id: string
          created_at?: string
          deviation_type?: string | null
          external_cost?: number | null
          id?: string
          is_package?: boolean | null
          material_cost?: number | null
          organization_id?: string
          parent_package_name?: string | null
          product_name: string
          quantity?: number
          setup_hours?: number | null
          sku?: string | null
          total_price?: number | null
          unit_price?: number | null
        }
        Update: {
          added_late?: boolean | null
          booking_product_id?: string | null
          category?: string | null
          caused_deviation?: boolean | null
          completion_id?: string
          created_at?: string
          deviation_type?: string | null
          external_cost?: number | null
          id?: string
          is_package?: boolean | null
          material_cost?: number | null
          organization_id?: string
          parent_package_name?: string | null
          product_name?: string
          quantity?: number
          setup_hours?: number | null
          sku?: string | null
          total_price?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "completion_products_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "job_completion_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completion_products_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "v_derived_project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completion_products_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "v_product_project_matrix"
            referencedColumns: ["completion_id"]
          },
          {
            foreignKeyName: "completion_products_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "v_staff_project_matrix"
            referencedColumns: ["completion_id"]
          },
        ]
      }
      completion_staff: {
        Row: {
          approved: boolean | null
          completion_id: string
          created_at: string
          hourly_rate: number | null
          hours_worked: number
          id: string
          organization_id: string
          overtime_hours: number
          role: string | null
          staff_id: string
          staff_name: string
          work_date: string
        }
        Insert: {
          approved?: boolean | null
          completion_id: string
          created_at?: string
          hourly_rate?: number | null
          hours_worked?: number
          id?: string
          organization_id?: string
          overtime_hours?: number
          role?: string | null
          staff_id: string
          staff_name: string
          work_date: string
        }
        Update: {
          approved?: boolean | null
          completion_id?: string
          created_at?: string
          hourly_rate?: number | null
          hours_worked?: number
          id?: string
          organization_id?: string
          overtime_hours?: number
          role?: string | null
          staff_id?: string
          staff_name?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "completion_staff_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "job_completion_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completion_staff_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "v_derived_project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completion_staff_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "v_product_project_matrix"
            referencedColumns: ["completion_id"]
          },
          {
            foreignKeyName: "completion_staff_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "v_staff_project_matrix"
            referencedColumns: ["completion_id"]
          },
        ]
      }
      current_time_registration: {
        Row: {
          confidence: number | null
          created_at: string
          current_kind: string | null
          current_label: string | null
          id: string
          last_gps_classification_at: string | null
          linked_location_time_entry_id: string | null
          needs_user_choice: boolean
          organization_id: string
          source: string
          staff_id: string
          started_at: string
          started_by_user: boolean
          status: string
          stopped_at: string | null
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          current_kind?: string | null
          current_label?: string | null
          id?: string
          last_gps_classification_at?: string | null
          linked_location_time_entry_id?: string | null
          needs_user_choice?: boolean
          organization_id: string
          source?: string
          staff_id: string
          started_at?: string
          started_by_user?: boolean
          status?: string
          stopped_at?: string | null
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          current_kind?: string | null
          current_label?: string | null
          id?: string
          last_gps_classification_at?: string | null
          linked_location_time_entry_id?: string | null
          needs_user_choice?: boolean
          organization_id?: string
          source?: string
          staff_id?: string
          started_at?: string
          started_by_user?: boolean
          status?: string
          stopped_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      day_attestations: {
        Row: {
          attested_at: string
          attested_by: string | null
          break_minutes: number
          comment: string | null
          created_at: string
          date: string
          id: string
          locked_at: string | null
          locked_by: string | null
          metadata: Json
          organization_id: string
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attested_at?: string
          attested_by?: string | null
          break_minutes?: number
          comment?: string | null
          created_at?: string
          date: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          metadata?: Json
          organization_id: string
          staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attested_at?: string
          attested_by?: string | null
          break_minutes?: number
          comment?: string | null
          created_at?: string
          date?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          metadata?: Json
          organization_id?: string
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      day_timeline_events: {
        Row: {
          accuracy: number | null
          computed_at: string
          confidence: number
          date: string
          distance_to_reported_site_m: number | null
          duration_min: number | null
          end_ts: string | null
          engine_version: string
          event_type: string
          human_readable_text: string
          id: string
          lat: number | null
          lng: number | null
          matched_site_id: string | null
          matched_site_name: string | null
          matched_site_type: string | null
          organization_id: string
          planned: boolean | null
          related_time_report_id: string | null
          related_workday_id: string | null
          source: string | null
          staff_id: string
          ts: string
        }
        Insert: {
          accuracy?: number | null
          computed_at?: string
          confidence?: number
          date: string
          distance_to_reported_site_m?: number | null
          duration_min?: number | null
          end_ts?: string | null
          engine_version?: string
          event_type: string
          human_readable_text: string
          id?: string
          lat?: number | null
          lng?: number | null
          matched_site_id?: string | null
          matched_site_name?: string | null
          matched_site_type?: string | null
          organization_id: string
          planned?: boolean | null
          related_time_report_id?: string | null
          related_workday_id?: string | null
          source?: string | null
          staff_id: string
          ts: string
        }
        Update: {
          accuracy?: number | null
          computed_at?: string
          confidence?: number
          date?: string
          distance_to_reported_site_m?: number | null
          duration_min?: number | null
          end_ts?: string | null
          engine_version?: string
          event_type?: string
          human_readable_text?: string
          id?: string
          lat?: number | null
          lng?: number | null
          matched_site_id?: string | null
          matched_site_name?: string | null
          matched_site_type?: string | null
          organization_id?: string
          planned?: boolean | null
          related_time_report_id?: string | null
          related_workday_id?: string | null
          source?: string | null
          staff_id?: string
          ts?: string
        }
        Relationships: []
      }
      day_timeline_snapshots: {
        Row: {
          created_at: string
          date: string
          engine_version: string
          event_count: number
          id: string
          input_signature: string | null
          is_dirty: boolean
          last_computed_at: string | null
          organization_id: string
          staff_id: string
          suggestion_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          engine_version?: string
          event_count?: number
          id?: string
          input_signature?: string | null
          is_dirty?: boolean
          last_computed_at?: string | null
          organization_id: string
          staff_id: string
          suggestion_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          engine_version?: string
          event_count?: number
          id?: string
          input_signature?: string | null
          is_dirty?: boolean
          last_computed_at?: string | null
          organization_id?: string
          staff_id?: string
          suggestion_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          created_at: string
          id: string
          last_refreshed_at: string
          organization_id: string
          platform: string
          staff_id: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_refreshed_at?: string
          organization_id?: string
          platform?: string
          staff_id: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_refreshed_at?: string
          organization_id?: string
          platform?: string
          staff_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          booking_id: string | null
          content: string
          created_at: string
          delivered_at: string | null
          file_name: string | null
          file_type: string | null
          file_url: string | null
          id: string
          is_archived_by: string[]
          is_read: boolean
          organization_id: string
          read_at: string | null
          recipient_id: string
          recipient_name: string
          sender_id: string
          sender_name: string
          sender_type: string
        }
        Insert: {
          booking_id?: string | null
          content: string
          created_at?: string
          delivered_at?: string | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_archived_by?: string[]
          is_read?: boolean
          organization_id?: string
          read_at?: string | null
          recipient_id: string
          recipient_name: string
          sender_id: string
          sender_name: string
          sender_type?: string
        }
        Update: {
          booking_id?: string | null
          content?: string
          created_at?: string
          delivered_at?: string | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_archived_by?: string[]
          is_read?: boolean
          organization_id?: string
          read_at?: string | null
          recipient_id?: string
          recipient_name?: string
          sender_id?: string
          sender_name?: string
          sender_type?: string
        }
        Relationships: []
      }
      economy_cache: {
        Row: {
          booking_id: string
          cached_at: string
          data: Json
          organization_id: string
        }
        Insert: {
          booking_id: string
          cached_at?: string
          data?: Json
          organization_id?: string
        }
        Update: {
          booking_id?: string
          cached_at?: string
          data?: Json
          organization_id?: string
        }
        Relationships: []
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
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
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
          {
            foreignKeyName: "establishment_subtasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      establishment_task_comments: {
        Row: {
          author_id: string | null
          author_name: string
          content: string
          created_at: string
          id: string
          organization_id: string
          task_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          author_name: string
          content: string
          created_at?: string
          id?: string
          organization_id: string
          task_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          organization_id?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "establishment_task_comments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "establishment_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      establishment_tasks: {
        Row: {
          assigned_to: string | null
          assigned_to_ids: string[] | null
          assigned_user_id: string | null
          blocker_responsible: string | null
          blockers: string | null
          booking_id: string | null
          calendar_event_id: string | null
          category: string
          completed: boolean | null
          created_at: string | null
          decision_needed: boolean
          description: string | null
          due_date: string | null
          end_date: string
          end_time: string | null
          id: string
          large_project_id: string | null
          linked_entity_id: string | null
          linked_entity_type: string
          notes: string | null
          organization_id: string
          priority: string
          readiness: string
          sort_order: number | null
          source: string | null
          source_product_id: string | null
          source_product_ids: string[] | null
          start_date: string
          start_date_ts: string | null
          start_time: string | null
          status: string
          task_type: string
          title: string
          updated_at: string | null
          visible_in_project_calendar: boolean
          visible_in_time_app: boolean
        }
        Insert: {
          assigned_to?: string | null
          assigned_to_ids?: string[] | null
          assigned_user_id?: string | null
          blocker_responsible?: string | null
          blockers?: string | null
          booking_id?: string | null
          calendar_event_id?: string | null
          category?: string
          completed?: boolean | null
          created_at?: string | null
          decision_needed?: boolean
          description?: string | null
          due_date?: string | null
          end_date: string
          end_time?: string | null
          id?: string
          large_project_id?: string | null
          linked_entity_id?: string | null
          linked_entity_type?: string
          notes?: string | null
          organization_id?: string
          priority?: string
          readiness?: string
          sort_order?: number | null
          source?: string | null
          source_product_id?: string | null
          source_product_ids?: string[] | null
          start_date: string
          start_date_ts?: string | null
          start_time?: string | null
          status?: string
          task_type?: string
          title: string
          updated_at?: string | null
          visible_in_project_calendar?: boolean
          visible_in_time_app?: boolean
        }
        Update: {
          assigned_to?: string | null
          assigned_to_ids?: string[] | null
          assigned_user_id?: string | null
          blocker_responsible?: string | null
          blockers?: string | null
          booking_id?: string | null
          calendar_event_id?: string | null
          category?: string
          completed?: boolean | null
          created_at?: string | null
          decision_needed?: boolean
          description?: string | null
          due_date?: string | null
          end_date?: string
          end_time?: string | null
          id?: string
          large_project_id?: string | null
          linked_entity_id?: string | null
          linked_entity_type?: string
          notes?: string | null
          organization_id?: string
          priority?: string
          readiness?: string
          sort_order?: number | null
          source?: string | null
          source_product_id?: string | null
          source_product_ids?: string[] | null
          start_date?: string
          start_date_ts?: string | null
          start_time?: string | null
          status?: string
          task_type?: string
          title?: string
          updated_at?: string | null
          visible_in_project_calendar?: boolean
          visible_in_time_app?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "establishment_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "confirmed_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_tasks_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_tasks_large_project_id_fkey"
            columns: ["large_project_id"]
            isOneToOne: false
            referencedRelation: "large_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_tasks_source_product_id_fkey"
            columns: ["source_product_id"]
            isOneToOne: false
            referencedRelation: "booking_products"
            referencedColumns: ["id"]
          },
        ]
      }
      external_supplier_contacts: {
        Row: {
          created_at: string
          email: string | null
          external_id: string
          id: string
          is_primary: boolean
          last_synced_at: string
          mobile: string | null
          name: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          raw: Json | null
          supplier_external_id: string
          supplier_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          external_id: string
          id?: string
          is_primary?: boolean
          last_synced_at?: string
          mobile?: string | null
          name?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          raw?: Json | null
          supplier_external_id: string
          supplier_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          external_id?: string
          id?: string
          is_primary?: boolean
          last_synced_at?: string
          mobile?: string | null
          name?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          raw?: Json | null
          supplier_external_id?: string
          supplier_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_supplier_contacts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "external_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      external_supplier_sync_state: {
        Row: {
          created_at: string
          last_error: string | null
          last_run_stats: Json | null
          last_status: string | null
          last_sync_at: string | null
          last_updated_at_seen: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          last_error?: string | null
          last_run_stats?: Json | null
          last_status?: string | null
          last_sync_at?: string | null
          last_updated_at_seen?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          last_error?: string | null
          last_run_stats?: Json | null
          last_status?: string | null
          last_sync_at?: string | null
          last_updated_at_seen?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      external_suppliers: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          external_created_at: string | null
          external_id: string
          external_updated_at: string | null
          id: string
          is_active: boolean
          last_synced_at: string
          name: string
          notes: string | null
          organization_id: string
          organization_number: string | null
          phone: string | null
          postal_code: string | null
          raw: Json | null
          updated_at: string
          vat_number: string | null
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          external_created_at?: string | null
          external_id: string
          external_updated_at?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string
          name: string
          notes?: string | null
          organization_id: string
          organization_number?: string | null
          phone?: string | null
          postal_code?: string | null
          raw?: Json | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          external_created_at?: string | null
          external_id?: string
          external_updated_at?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string
          name?: string
          notes?: string | null
          organization_id?: string
          organization_number?: string | null
          phone?: string | null
          postal_code?: string | null
          raw?: Json | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Relationships: []
      }
      gps_pulse_log: {
        Row: {
          delivered_at: string | null
          delivered_ping_id: string | null
          device_token_id: string | null
          fcm_error: string | null
          id: string
          lag_ms: number | null
          organization_id: string
          sent_at: string
          staff_id: string
          success: boolean
        }
        Insert: {
          delivered_at?: string | null
          delivered_ping_id?: string | null
          device_token_id?: string | null
          fcm_error?: string | null
          id?: string
          lag_ms?: number | null
          organization_id: string
          sent_at?: string
          staff_id: string
          success?: boolean
        }
        Update: {
          delivered_at?: string | null
          delivered_ping_id?: string | null
          device_token_id?: string | null
          fcm_error?: string | null
          id?: string
          lag_ms?: number | null
          organization_id?: string
          sent_at?: string
          staff_id?: string
          success?: boolean
        }
        Relationships: []
      }
      job_completion_analytics: {
        Row: {
          booking_id: string
          booking_number: string | null
          carry_more_than_10m: boolean | null
          client_name: string
          closed_at: string | null
          completed_at: string
          complexity_score: number | null
          created_at: string
          customer_type: string | null
          delivery_address: string | null
          delivery_city: string | null
          delivery_type: string | null
          deviation_types: string[] | null
          end_date: string | null
          event_date: string | null
          exact_time_required: boolean | null
          geographic_area: string | null
          ground_nails_allowed: boolean | null
          had_deviations: boolean | null
          had_late_changes: boolean | null
          id: string
          invoice_date: string | null
          is_indoor: boolean | null
          margin_percentage: number | null
          organization_id: string
          product_categories: Json | null
          project_id: string | null
          project_type: string | null
          rig_date: string | null
          rigdown_date: string | null
          staff_assignments: Json | null
          start_date: string | null
          total_approved_hours: number | null
          total_deliveries: number | null
          total_external_cost: number | null
          total_hours_worked: number | null
          total_labor_cost: number | null
          total_margin: number | null
          total_material_cost: number | null
          total_overtime_hours: number | null
          total_parcels: number | null
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
          closed_at?: string | null
          completed_at?: string
          complexity_score?: number | null
          created_at?: string
          customer_type?: string | null
          delivery_address?: string | null
          delivery_city?: string | null
          delivery_type?: string | null
          deviation_types?: string[] | null
          end_date?: string | null
          event_date?: string | null
          exact_time_required?: boolean | null
          geographic_area?: string | null
          ground_nails_allowed?: boolean | null
          had_deviations?: boolean | null
          had_late_changes?: boolean | null
          id?: string
          invoice_date?: string | null
          is_indoor?: boolean | null
          margin_percentage?: number | null
          organization_id?: string
          product_categories?: Json | null
          project_id?: string | null
          project_type?: string | null
          rig_date?: string | null
          rigdown_date?: string | null
          staff_assignments?: Json | null
          start_date?: string | null
          total_approved_hours?: number | null
          total_deliveries?: number | null
          total_external_cost?: number | null
          total_hours_worked?: number | null
          total_labor_cost?: number | null
          total_margin?: number | null
          total_material_cost?: number | null
          total_overtime_hours?: number | null
          total_parcels?: number | null
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
          closed_at?: string | null
          completed_at?: string
          complexity_score?: number | null
          created_at?: string
          customer_type?: string | null
          delivery_address?: string | null
          delivery_city?: string | null
          delivery_type?: string | null
          deviation_types?: string[] | null
          end_date?: string | null
          event_date?: string | null
          exact_time_required?: boolean | null
          geographic_area?: string | null
          ground_nails_allowed?: boolean | null
          had_deviations?: boolean | null
          had_late_changes?: boolean | null
          id?: string
          invoice_date?: string | null
          is_indoor?: boolean | null
          margin_percentage?: number | null
          organization_id?: string
          product_categories?: Json | null
          project_id?: string | null
          project_type?: string | null
          rig_date?: string | null
          rigdown_date?: string | null
          staff_assignments?: Json | null
          start_date?: string | null
          total_approved_hours?: number | null
          total_deliveries?: number | null
          total_external_cost?: number | null
          total_hours_worked?: number | null
          total_labor_cost?: number | null
          total_margin?: number | null
          total_material_cost?: number | null
          total_overtime_hours?: number | null
          total_parcels?: number | null
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
            foreignKeyName: "job_completion_analytics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_completion_analytics_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      job_messages: {
        Row: {
          booking_id: string
          content: string | null
          created_at: string
          delivered_at: string | null
          file_name: string | null
          file_type: string | null
          file_url: string | null
          id: string
          is_archived: boolean
          is_archived_by: string[]
          organization_id: string
          read_by: Json
          sender_id: string
          sender_name: string
          sender_role: string
        }
        Insert: {
          booking_id: string
          content?: string | null
          created_at?: string
          delivered_at?: string | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_archived?: boolean
          is_archived_by?: string[]
          organization_id?: string
          read_by?: Json
          sender_id: string
          sender_name: string
          sender_role?: string
        }
        Update: {
          booking_id?: string
          content?: string | null
          created_at?: string
          delivered_at?: string | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_archived?: boolean
          is_archived_by?: string[]
          organization_id?: string
          read_by?: Json
          sender_id?: string
          sender_name?: string
          sender_role?: string
        }
        Relationships: []
      }
      job_staff_assignments: {
        Row: {
          assignment_date: string
          created_at: string
          id: string
          job_id: string
          organization_id: string
          staff_id: string
        }
        Insert: {
          assignment_date: string
          created_at?: string
          id?: string
          job_id: string
          organization_id?: string
          staff_id: string
        }
        Update: {
          assignment_date?: string
          created_at?: string
          id?: string
          job_id?: string
          organization_id?: string
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
            foreignKeyName: "job_staff_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          deleted_at: string | null
          id: string
          name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      large_project_booking_plan_items: {
        Row: {
          assigned_staff_id: string | null
          assigned_team_id: string | null
          booking_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_time: string | null
          id: string
          item_type: string
          large_project_id: string
          metadata: Json
          notes: string | null
          organization_id: string
          parent_item_id: string | null
          phase: string | null
          plan_date: string
          sort_order: number
          source: string
          source_booking_phase: string | null
          start_time: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_staff_id?: string | null
          assigned_team_id?: string | null
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          item_type?: string
          large_project_id: string
          metadata?: Json
          notes?: string | null
          organization_id: string
          parent_item_id?: string | null
          phase?: string | null
          plan_date: string
          sort_order?: number
          source?: string
          source_booking_phase?: string | null
          start_time?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_staff_id?: string | null
          assigned_team_id?: string | null
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          item_type?: string
          large_project_id?: string
          metadata?: Json
          notes?: string | null
          organization_id?: string
          parent_item_id?: string | null
          phase?: string | null
          plan_date?: string
          sort_order?: number
          source?: string
          source_booking_phase?: string | null
          start_time?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "large_project_booking_plan_items_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "large_project_booking_plan_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "large_project_booking_plan_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "confirmed_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "large_project_booking_plan_items_large_project_id_fkey"
            columns: ["large_project_id"]
            isOneToOne: false
            referencedRelation: "large_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "large_project_booking_plan_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "large_project_booking_plan_items"
            referencedColumns: ["id"]
          },
        ]
      }
      large_project_bookings: {
        Row: {
          booking_id: string
          created_at: string
          display_name: string | null
          id: string
          large_project_id: string
          organization_id: string
          sort_order: number | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          large_project_id: string
          organization_id?: string
          sort_order?: number | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          large_project_id?: string
          organization_id?: string
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
          {
            foreignKeyName: "large_project_bookings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string
          updated_at: string
        }
        Insert: {
          budgeted_hours?: number | null
          created_at?: string
          description?: string | null
          hourly_rate?: number | null
          id?: string
          large_project_id: string
          organization_id?: string
          updated_at?: string
        }
        Update: {
          budgeted_hours?: number | null
          created_at?: string
          description?: string | null
          hourly_rate?: number | null
          id?: string
          large_project_id?: string
          organization_id?: string
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
          {
            foreignKeyName: "large_project_budget_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      large_project_cost_lines: {
        Row: {
          amount: number
          budget_amount: number
          category: string
          cost_date: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          large_project_id: string
          notes: string | null
          organization_id: string
          supplier: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          budget_amount?: number
          category: string
          cost_date?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          large_project_id: string
          notes?: string | null
          organization_id: string
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          budget_amount?: number
          category?: string
          cost_date?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          large_project_id?: string
          notes?: string | null
          organization_id?: string
          supplier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "large_project_cost_lines_large_project_id_fkey"
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
          organization_id: string
          uploaded_at: string
          uploaded_by: string | null
          url: string
        }
        Insert: {
          file_name: string
          file_type?: string | null
          id?: string
          large_project_id: string
          organization_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          url: string
        }
        Update: {
          file_name?: string
          file_type?: string | null
          id?: string
          large_project_id?: string
          organization_id?: string
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
          {
            foreignKeyName: "large_project_files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
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
          {
            foreignKeyName: "large_project_gantt_steps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      large_project_purchases: {
        Row: {
          amount: number | null
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          category: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          large_project_id: string
          organization_id: string
          purchase_date: string | null
          receipt_url: string | null
          supplier: string | null
        }
        Insert: {
          amount?: number | null
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          large_project_id: string
          organization_id?: string
          purchase_date?: string | null
          receipt_url?: string | null
          supplier?: string | null
        }
        Update: {
          amount?: number | null
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          large_project_id?: string
          organization_id?: string
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
          {
            foreignKeyName: "large_project_purchases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      large_project_staff: {
        Row: {
          created_at: string
          id: string
          large_project_id: string
          organization_id: string
          role: string
          staff_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          large_project_id: string
          organization_id: string
          role?: string
          staff_id: string
        }
        Update: {
          created_at?: string
          id?: string
          large_project_id?: string
          organization_id?: string
          role?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "large_project_staff_large_project_id_fkey"
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
          execution_task_id: string | null
          id: string
          is_info_only: boolean | null
          large_project_id: string
          organization_id: string
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
          execution_task_id?: string | null
          id?: string
          is_info_only?: boolean | null
          large_project_id: string
          organization_id?: string
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
          execution_task_id?: string | null
          id?: string
          is_info_only?: boolean | null
          large_project_id?: string
          organization_id?: string
          sort_order?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "large_project_tasks_execution_task_id_fkey"
            columns: ["execution_task_id"]
            isOneToOne: false
            referencedRelation: "establishment_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "large_project_tasks_large_project_id_fkey"
            columns: ["large_project_id"]
            isOneToOne: false
            referencedRelation: "large_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "large_project_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      large_project_team_assignments: {
        Row: {
          assignment_date: string
          created_at: string
          id: string
          large_project_id: string
          organization_id: string
          phase: string
          team_id: string
          updated_at: string
        }
        Insert: {
          assignment_date: string
          created_at?: string
          id?: string
          large_project_id: string
          organization_id?: string
          phase: string
          team_id: string
          updated_at?: string
        }
        Update: {
          assignment_date?: string
          created_at?: string
          id?: string
          large_project_id?: string
          organization_id?: string
          phase?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "large_project_team_assignments_large_project_id_fkey"
            columns: ["large_project_id"]
            isOneToOne: false
            referencedRelation: "large_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      large_project_view_config: {
        Row: {
          column_order: Json
          created_at: string
          created_by: string | null
          custom_columns: Json
          custom_values: Json
          id: string
          large_project_id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          column_order?: Json
          created_at?: string
          created_by?: string | null
          custom_columns?: Json
          custom_values?: Json
          id?: string
          large_project_id: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          column_order?: Json
          created_at?: string
          created_by?: string | null
          custom_columns?: Json
          custom_values?: Json
          id?: string
          large_project_id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      large_projects: {
        Row: {
          address: string | null
          address_city: string | null
          address_geofence_mode: string
          address_geofence_polygon: Json | null
          address_latitude: number | null
          address_longitude: number | null
          address_postal_code: string | null
          address_radius_meters: number
          created_at: string
          customer_pickup: boolean
          deleted_at: string | null
          description: string | null
          end_date: string[] | null
          event_date: string[] | null
          id: string
          internalnotes: string | null
          location: string | null
          name: string
          organization_id: string
          planning_status: Database["public"]["Enums"]["project_planning_status"]
          project_leader: string | null
          project_number: string | null
          start_date: string[] | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          address_city?: string | null
          address_geofence_mode?: string
          address_geofence_polygon?: Json | null
          address_latitude?: number | null
          address_longitude?: number | null
          address_postal_code?: string | null
          address_radius_meters?: number
          created_at?: string
          customer_pickup?: boolean
          deleted_at?: string | null
          description?: string | null
          end_date?: string[] | null
          event_date?: string[] | null
          id?: string
          internalnotes?: string | null
          location?: string | null
          name: string
          organization_id?: string
          planning_status?: Database["public"]["Enums"]["project_planning_status"]
          project_leader?: string | null
          project_number?: string | null
          start_date?: string[] | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          address_city?: string | null
          address_geofence_mode?: string
          address_geofence_polygon?: Json | null
          address_latitude?: number | null
          address_longitude?: number | null
          address_postal_code?: string | null
          address_radius_meters?: number
          created_at?: string
          customer_pickup?: boolean
          deleted_at?: string | null
          description?: string | null
          end_date?: string[] | null
          event_date?: string[] | null
          id?: string
          internalnotes?: string | null
          location?: string | null
          name?: string
          organization_id?: string
          planning_status?: Database["public"]["Enums"]["project_planning_status"]
          project_leader?: string | null
          project_number?: string | null
          start_date?: string[] | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "large_projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      location_auto_start_cursor: {
        Row: {
          id: string
          last_processed_recorded_at: string | null
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          id: string
          last_processed_recorded_at?: string | null
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          last_processed_recorded_at?: string | null
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      location_auto_start_runs: {
        Row: {
          arrivals: number
          closed_ltes: number
          created_assistant_events: number
          created_travel_logs: number
          created_workdays: number
          date_filter: string | null
          dry_run: boolean
          engine_version: string
          errors: Json
          finished_at: string | null
          from_iso: string | null
          id: string
          mode: string
          opened_ltes: number
          organization_id: string | null
          pings_processed: number
          plan: Json | null
          request_body: Json | null
          skipped_existing: number
          source_tag: string
          staff_count: number
          staff_id: string | null
          started_at: string
          status: string
          switches: number
          to_iso: string | null
        }
        Insert: {
          arrivals?: number
          closed_ltes?: number
          created_assistant_events?: number
          created_travel_logs?: number
          created_workdays?: number
          date_filter?: string | null
          dry_run?: boolean
          engine_version: string
          errors?: Json
          finished_at?: string | null
          from_iso?: string | null
          id?: string
          mode: string
          opened_ltes?: number
          organization_id?: string | null
          pings_processed?: number
          plan?: Json | null
          request_body?: Json | null
          skipped_existing?: number
          source_tag: string
          staff_count?: number
          staff_id?: string | null
          started_at?: string
          status?: string
          switches?: number
          to_iso?: string | null
        }
        Update: {
          arrivals?: number
          closed_ltes?: number
          created_assistant_events?: number
          created_travel_logs?: number
          created_workdays?: number
          date_filter?: string | null
          dry_run?: boolean
          engine_version?: string
          errors?: Json
          finished_at?: string | null
          from_iso?: string | null
          id?: string
          mode?: string
          opened_ltes?: number
          organization_id?: string | null
          pings_processed?: number
          plan?: Json | null
          request_body?: Json | null
          skipped_existing?: number
          source_tag?: string
          staff_count?: number
          staff_id?: string | null
          started_at?: string
          status?: string
          switches?: number
          to_iso?: string | null
        }
        Relationships: []
      }
      location_time_entries: {
        Row: {
          booking_id: string | null
          client_dedupe_key: string | null
          created_at: string | null
          entered_at: string
          entry_date: string
          exited_at: string | null
          id: string
          large_project_id: string | null
          location_id: string | null
          metadata: Json
          organization_id: string
          source: string
          staff_id: string
          stop_metadata: Json
          stop_reason: string | null
          stop_source: string | null
          stopped_by: string | null
          task_id: string | null
          total_minutes: number | null
        }
        Insert: {
          booking_id?: string | null
          client_dedupe_key?: string | null
          created_at?: string | null
          entered_at: string
          entry_date: string
          exited_at?: string | null
          id?: string
          large_project_id?: string | null
          location_id?: string | null
          metadata?: Json
          organization_id: string
          source?: string
          staff_id: string
          stop_metadata?: Json
          stop_reason?: string | null
          stop_source?: string | null
          stopped_by?: string | null
          task_id?: string | null
          total_minutes?: number | null
        }
        Update: {
          booking_id?: string | null
          client_dedupe_key?: string | null
          created_at?: string | null
          entered_at?: string
          entry_date?: string
          exited_at?: string | null
          id?: string
          large_project_id?: string | null
          location_id?: string | null
          metadata?: Json
          organization_id?: string
          source?: string
          staff_id?: string
          stop_metadata?: Json
          stop_reason?: string | null
          stop_source?: string | null
          stopped_by?: string | null
          task_id?: string | null
          total_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "location_time_entries_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "organization_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_time_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_locations: {
        Row: {
          address: string | null
          created_at: string | null
          geofence_mode: string
          geofence_polygon: Json | null
          id: string
          is_active: boolean
          is_private_residence: boolean
          latitude: number
          location_type: string
          longitude: number
          metadata: Json
          name: string
          organization_id: string
          privacy_level: string
          radius_meters: number
          show_as_project: boolean
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          geofence_mode?: string
          geofence_polygon?: Json | null
          id?: string
          is_active?: boolean
          is_private_residence?: boolean
          latitude: number
          location_type?: string
          longitude: number
          metadata?: Json
          name: string
          organization_id: string
          privacy_level?: string
          radius_meters?: number
          show_as_project?: boolean
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          geofence_mode?: string
          geofence_polygon?: Json | null
          id?: string
          is_active?: boolean
          is_private_residence?: boolean
          latitude?: number
          location_type?: string
          longitude?: number
          metadata?: Json
          name?: string
          organization_id?: string
          privacy_level?: string
          radius_meters?: number
          show_as_project?: boolean
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_locations_organization_id_fkey"
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
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
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
          organization_id: string
          packing_id: string
          updated_at: string
        }
        Insert: {
          budgeted_hours?: number
          created_at?: string
          description?: string | null
          hourly_rate?: number
          id?: string
          organization_id?: string
          packing_id: string
          updated_at?: string
        }
        Update: {
          budgeted_hours?: number
          created_at?: string
          description?: string | null
          hourly_rate?: number
          id?: string
          organization_id?: string
          packing_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_budget_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          organization_id: string
          packing_id: string
        }
        Insert: {
          author_name: string
          content: string
          created_at?: string
          id?: string
          organization_id?: string
          packing_id: string
        }
        Update: {
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          organization_id?: string
          packing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_comments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          organization_id: string
          packing_id: string
          uploaded_at: string
          uploaded_by: string | null
          url: string
        }
        Insert: {
          file_name: string
          file_type?: string | null
          id?: string
          organization_id?: string
          packing_id: string
          uploaded_at?: string
          uploaded_by?: string | null
          url: string
        }
        Update: {
          file_name?: string
          file_type?: string | null
          id?: string
          organization_id?: string
          packing_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
          packing_id?: string
          quote_id?: string | null
          status?: string
          supplier?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
          packing_id?: string
          staff_id?: string | null
          staff_name?: string
          work_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packing_labor_costs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
      packing_list_item_allocations: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          packing_list_item_id: string
          parcel_id: string
          quantity: number
          scanned_at: string
          scanned_by: string | null
          scanned_by_staff_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          packing_list_item_id: string
          parcel_id: string
          quantity: number
          scanned_at?: string
          scanned_by?: string | null
          scanned_by_staff_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          packing_list_item_id?: string
          parcel_id?: string
          quantity?: number
          scanned_at?: string
          scanned_by?: string | null
          scanned_by_staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packing_list_item_allocations_packing_list_item_id_fkey"
            columns: ["packing_list_item_id"]
            isOneToOne: false
            referencedRelation: "packing_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_list_item_allocations_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "packing_parcels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_list_item_allocations_scanned_by_staff_id_fkey"
            columns: ["scanned_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_list_items: {
        Row: {
          booking_product_id: string | null
          created_at: string
          excluded: boolean
          id: string
          manual_name: string | null
          notes: string | null
          organization_id: string
          packed_at: string | null
          packed_by: string | null
          packed_by_staff_id: string | null
          packing_id: string
          parcel_id: string | null
          quantity_packed: number
          quantity_returned: number
          quantity_to_pack: number
          returned_at: string | null
          returned_by: string | null
          verified_at: string | null
          verified_by: string | null
          verified_by_staff_id: string | null
        }
        Insert: {
          booking_product_id?: string | null
          created_at?: string
          excluded?: boolean
          id?: string
          manual_name?: string | null
          notes?: string | null
          organization_id?: string
          packed_at?: string | null
          packed_by?: string | null
          packed_by_staff_id?: string | null
          packing_id: string
          parcel_id?: string | null
          quantity_packed?: number
          quantity_returned?: number
          quantity_to_pack?: number
          returned_at?: string | null
          returned_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          verified_by_staff_id?: string | null
        }
        Update: {
          booking_product_id?: string | null
          created_at?: string
          excluded?: boolean
          id?: string
          manual_name?: string | null
          notes?: string | null
          organization_id?: string
          packed_at?: string | null
          packed_by?: string | null
          packed_by_staff_id?: string | null
          packing_id?: string
          parcel_id?: string | null
          quantity_packed?: number
          quantity_returned?: number
          quantity_to_pack?: number
          returned_at?: string | null
          returned_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          verified_by_staff_id?: string | null
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
            foreignKeyName: "packing_list_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_list_items_packed_by_staff_id_fkey"
            columns: ["packed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
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
          {
            foreignKeyName: "packing_list_items_verified_by_staff_id_fkey"
            columns: ["verified_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_parcels: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_staff_id: string | null
          id: string
          is_qr_only: boolean
          organization_id: string
          packing_id: string
          parcel_number: number
          qr_code: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_staff_id?: string | null
          id?: string
          is_qr_only?: boolean
          organization_id?: string
          packing_id: string
          parcel_number: number
          qr_code?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_staff_id?: string | null
          id?: string
          is_qr_only?: boolean
          organization_id?: string
          packing_id?: string
          parcel_number?: number
          qr_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packing_parcels_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_parcels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_parcels_packing_id_fkey"
            columns: ["packing_id"]
            isOneToOne: false
            referencedRelation: "packing_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_project_bookings: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          organization_id: string
          packing_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          organization_id: string
          packing_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          packing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_project_bookings_packing_id_fkey"
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
          client_name: string | null
          created_at: string
          delivery_address: string | null
          end_date: string | null
          id: string
          large_project_id: string | null
          name: string
          needs_packing_review: boolean
          needs_packing_review_reason: string | null
          notes: string | null
          organization_id: string
          project_leader: string | null
          signed_at: string | null
          signed_by: string | null
          signed_by_staff_id: string | null
          start_date: string | null
          status: string
          updated_at: string
          warehouse_project_id: string | null
        }
        Insert: {
          booking_id?: string | null
          client_name?: string | null
          created_at?: string
          delivery_address?: string | null
          end_date?: string | null
          id?: string
          large_project_id?: string | null
          name: string
          needs_packing_review?: boolean
          needs_packing_review_reason?: string | null
          notes?: string | null
          organization_id?: string
          project_leader?: string | null
          signed_at?: string | null
          signed_by?: string | null
          signed_by_staff_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          warehouse_project_id?: string | null
        }
        Update: {
          booking_id?: string | null
          client_name?: string | null
          created_at?: string
          delivery_address?: string | null
          end_date?: string | null
          id?: string
          large_project_id?: string | null
          name?: string
          needs_packing_review?: boolean
          needs_packing_review_reason?: string | null
          notes?: string | null
          organization_id?: string
          project_leader?: string | null
          signed_at?: string | null
          signed_by?: string | null
          signed_by_staff_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          warehouse_project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packing_projects_large_project_id_fkey"
            columns: ["large_project_id"]
            isOneToOne: false
            referencedRelation: "large_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_projects_signed_by_staff_id_fkey"
            columns: ["signed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_projects_warehouse_project_id_fkey"
            columns: ["warehouse_project_id"]
            isOneToOne: false
            referencedRelation: "warehouse_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_purchases: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
          packing_id?: string
          purchase_date?: string | null
          receipt_url?: string | null
          supplier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packing_purchases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
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
            foreignKeyName: "packing_quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_quotes_packing_id_fkey"
            columns: ["packing_id"]
            isOneToOne: false
            referencedRelation: "packing_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_sync_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          organization_id: string
          packing_id: string
          performed_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          organization_id?: string
          packing_id: string
          performed_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          organization_id?: string
          packing_id?: string
          performed_by?: string | null
        }
        Relationships: []
      }
      packing_task_comments: {
        Row: {
          author_id: string | null
          author_name: string
          content: string
          created_at: string
          id: string
          organization_id: string
          task_id: string
        }
        Insert: {
          author_id?: string | null
          author_name: string
          content: string
          created_at?: string
          id?: string
          organization_id?: string
          task_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          organization_id?: string
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
            foreignKeyName: "packing_task_comments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
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
            foreignKeyName: "packing_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      pickup_stops: {
        Row: {
          calendar_event_id: string | null
          created_at: string
          created_by: string | null
          external_supplier_id: string
          id: string
          large_project_id: string | null
          note: string | null
          organization_id: string
          project_id: string | null
          scheduled_at: string | null
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          calendar_event_id?: string | null
          created_at?: string
          created_by?: string | null
          external_supplier_id: string
          id?: string
          large_project_id?: string | null
          note?: string | null
          organization_id: string
          project_id?: string | null
          scheduled_at?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          calendar_event_id?: string | null
          created_at?: string
          created_by?: string | null
          external_supplier_id?: string
          id?: string
          large_project_id?: string | null
          note?: string | null
          organization_id?: string
          project_id?: string | null
          scheduled_at?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_stops_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_stops_external_supplier_id_fkey"
            columns: ["external_supplier_id"]
            isOneToOne: false
            referencedRelation: "external_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_stops_large_project_id_fkey"
            columns: ["large_project_id"]
            isOneToOne: false
            referencedRelation: "large_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_stops_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      product_cost_overrides: {
        Row: {
          assembly_cost: number | null
          booking_id: string | null
          handling_cost: number | null
          id: string
          organization_id: string | null
          product_id: string
          project_id: string
          purchase_cost: number | null
          updated_at: string | null
        }
        Insert: {
          assembly_cost?: number | null
          booking_id?: string | null
          handling_cost?: number | null
          id?: string
          organization_id?: string | null
          product_id: string
          project_id: string
          purchase_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          assembly_cost?: number | null
          booking_id?: string | null
          handling_cost?: number | null
          id?: string
          organization_id?: string | null
          product_id?: string
          project_id?: string
          purchase_cost?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_cost_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_groupings: {
        Row: {
          created_at: string
          created_by: string | null
          groups: Json
          id: string
          organization_id: string
          prompt: string | null
          scope: string
          scope_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          groups?: Json
          id?: string
          organization_id: string
          prompt?: string | null
          scope: string
          scope_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          groups?: Json
          id?: string
          organization_id?: string
          prompt?: string | null
          scope?: string
          scope_id?: string
          updated_at?: string
        }
        Relationships: []
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
          organization_id: string
          performed_by: string | null
          project_id: string
        }
        Insert: {
          action: string
          created_at?: string
          description: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          performed_by?: string | null
          project_id: string
        }
        Update: {
          action?: string
          created_at?: string
          description?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          performed_by?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_activity_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_activity_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assistants: {
        Row: {
          assistant_name: string
          created_at: string | null
          id: string
          organization_id: string
          project_id: string
          project_type: string
        }
        Insert: {
          assistant_name: string
          created_at?: string | null
          id?: string
          organization_id: string
          project_id: string
          project_type?: string
        }
        Update: {
          assistant_name?: string
          created_at?: string | null
          id?: string
          organization_id?: string
          project_id?: string
          project_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assistants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_audit_log: {
        Row: {
          action: string
          booking_id: string | null
          created_at: string
          details: Json | null
          id: string
          organization_id: string
          performed_by: string | null
          project_id: string
          project_type: string
        }
        Insert: {
          action: string
          booking_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          organization_id: string
          performed_by?: string | null
          project_id: string
          project_type: string
        }
        Update: {
          action?: string
          booking_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          organization_id?: string
          performed_by?: string | null
          project_id?: string
          project_type?: string
        }
        Relationships: []
      }
      project_billing: {
        Row: {
          approved_by: string | null
          approved_for_invoicing_at: string | null
          billing_status: Database["public"]["Enums"]["billing_status"]
          booking_id: string | null
          client_name: string | null
          closed_at: string | null
          created_at: string
          delivery_date: string | null
          due_date: string | null
          event_date: string | null
          external_invoice_id: string | null
          id: string
          internal_notes: string | null
          invoice_date: string | null
          invoice_number: string | null
          invoice_paid_at: string | null
          invoice_reference: string | null
          invoice_sent_at: string | null
          invoiceable_amount: number | null
          invoiced_amount: number | null
          organization_id: string
          project_id: string
          project_leader: string | null
          project_name: string
          project_type: string
          quoted_amount: number | null
          review_checklist: Json | null
          review_completed_at: string | null
          review_status: string | null
          total_cost: number | null
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          approved_for_invoicing_at?: string | null
          billing_status?: Database["public"]["Enums"]["billing_status"]
          booking_id?: string | null
          client_name?: string | null
          closed_at?: string | null
          created_at?: string
          delivery_date?: string | null
          due_date?: string | null
          event_date?: string | null
          external_invoice_id?: string | null
          id?: string
          internal_notes?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_paid_at?: string | null
          invoice_reference?: string | null
          invoice_sent_at?: string | null
          invoiceable_amount?: number | null
          invoiced_amount?: number | null
          organization_id?: string
          project_id: string
          project_leader?: string | null
          project_name: string
          project_type: string
          quoted_amount?: number | null
          review_checklist?: Json | null
          review_completed_at?: string | null
          review_status?: string | null
          total_cost?: number | null
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          approved_for_invoicing_at?: string | null
          billing_status?: Database["public"]["Enums"]["billing_status"]
          booking_id?: string | null
          client_name?: string | null
          closed_at?: string | null
          created_at?: string
          delivery_date?: string | null
          due_date?: string | null
          event_date?: string | null
          external_invoice_id?: string | null
          id?: string
          internal_notes?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_paid_at?: string | null
          invoice_reference?: string | null
          invoice_sent_at?: string | null
          invoiceable_amount?: number | null
          invoiced_amount?: number | null
          organization_id?: string
          project_id?: string
          project_leader?: string | null
          project_name?: string
          project_type?: string
          quoted_amount?: number | null
          review_checklist?: Json | null
          review_completed_at?: string | null
          review_status?: string | null
          total_cost?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      project_budget: {
        Row: {
          budgeted_hours: number
          created_at: string
          description: string | null
          hourly_rate: number
          id: string
          organization_id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          budgeted_hours?: number
          created_at?: string
          description?: string | null
          hourly_rate?: number
          id?: string
          organization_id?: string
          project_id: string
          updated_at?: string
        }
        Update: {
          budgeted_hours?: number
          created_at?: string
          description?: string | null
          hourly_rate?: number
          id?: string
          organization_id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_budget_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_budget_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
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
          organization_id: string
          project_id: string
          uploaded_at: string
          uploaded_by: string | null
          url: string
        }
        Insert: {
          file_name: string
          file_type?: string | null
          id?: string
          organization_id?: string
          project_id: string
          uploaded_at?: string
          uploaded_by?: string | null
          url: string
        }
        Update: {
          file_name?: string
          file_type?: string | null
          id?: string
          organization_id?: string
          project_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
          project_id?: string
          quote_id?: string | null
          status?: string
          supplier?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
          project_id?: string
          staff_id?: string | null
          staff_name?: string
          work_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_labor_costs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          category: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          organization_id: string
          project_id: string
          purchase_date: string | null
          receipt_url: string | null
          supplier: string | null
        }
        Insert: {
          amount?: number
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          organization_id?: string
          project_id: string
          purchase_date?: string | null
          receipt_url?: string | null
          supplier?: string | null
        }
        Update: {
          amount?: number
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          organization_id?: string
          project_id?: string
          purchase_date?: string | null
          receipt_url?: string | null
          supplier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_purchases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
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
            foreignKeyName: "project_quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_staff_time_cost_lines: {
        Row: {
          assignment_id: string | null
          booking_id: string | null
          cost: number
          created_at: string
          date: string
          end_at: string
          hourly_rate: number
          hours: number
          id: string
          large_project_id: string | null
          location_id: string | null
          minutes: number
          organization_id: string
          project_id: string | null
          rate_source: string | null
          source_block_id: string | null
          source_block_kind: string | null
          source_label: string | null
          staff_day_submission_id: string
          staff_id: string
          staff_name: string | null
          start_at: string
          submission_status: string
          updated_at: string
        }
        Insert: {
          assignment_id?: string | null
          booking_id?: string | null
          cost?: number
          created_at?: string
          date: string
          end_at: string
          hourly_rate?: number
          hours: number
          id?: string
          large_project_id?: string | null
          location_id?: string | null
          minutes: number
          organization_id: string
          project_id?: string | null
          rate_source?: string | null
          source_block_id?: string | null
          source_block_kind?: string | null
          source_label?: string | null
          staff_day_submission_id: string
          staff_id: string
          staff_name?: string | null
          start_at: string
          submission_status: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string | null
          booking_id?: string | null
          cost?: number
          created_at?: string
          date?: string
          end_at?: string
          hourly_rate?: number
          hours?: number
          id?: string
          large_project_id?: string | null
          location_id?: string | null
          minutes?: number
          organization_id?: string
          project_id?: string | null
          rate_source?: string | null
          source_block_id?: string | null
          source_block_kind?: string | null
          source_label?: string | null
          staff_day_submission_id?: string
          staff_id?: string
          staff_name?: string | null
          start_at?: string
          submission_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_staff_time_cost_lines_staff_day_submission_id_fkey"
            columns: ["staff_day_submission_id"]
            isOneToOne: false
            referencedRelation: "staff_day_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      project_supplier_links: {
        Row: {
          confirmed_price: number | null
          contact_id: string | null
          created_at: string
          currency: string
          delivery_date: string | null
          id: string
          notes: string | null
          organization_id: string
          project_id: string
          quoted_price: number | null
          service_type: string | null
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          confirmed_price?: number | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          delivery_date?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          project_id: string
          quoted_price?: number | null
          service_type?: string | null
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          confirmed_price?: number | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          delivery_date?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          project_id?: string
          quoted_price?: number | null
          service_type?: string | null
          status?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_supplier_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_suppliers: {
        Row: {
          company_name: string | null
          confirmed_price: number | null
          contact_person: string | null
          created_at: string
          currency: string | null
          delivery_date: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          project_id: string
          quoted_price: number | null
          service_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          confirmed_price?: number | null
          contact_person?: string | null
          created_at?: string
          currency?: string | null
          delivery_date?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          project_id: string
          quoted_price?: number | null
          service_type?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          confirmed_price?: number | null
          contact_person?: string | null
          created_at?: string
          currency?: string | null
          delivery_date?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          project_id?: string
          quoted_price?: number | null
          service_type?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_organization"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_suppliers_project_id_fkey"
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
          assigned_to_ids: string[] | null
          category: string | null
          completed: boolean
          created_at: string
          created_by: string | null
          deadline: string | null
          dependency_task_id: string | null
          description: string | null
          end_date: string | null
          execution_task_id: string | null
          id: string
          is_info_only: boolean | null
          organization_id: string
          phase: string | null
          project_id: string
          sort_order: number
          start_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          assigned_to_ids?: string[] | null
          category?: string | null
          completed?: boolean
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          dependency_task_id?: string | null
          description?: string | null
          end_date?: string | null
          execution_task_id?: string | null
          id?: string
          is_info_only?: boolean | null
          organization_id?: string
          phase?: string | null
          project_id: string
          sort_order?: number
          start_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          assigned_to_ids?: string[] | null
          category?: string | null
          completed?: boolean
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          dependency_task_id?: string | null
          description?: string | null
          end_date?: string | null
          execution_task_id?: string | null
          id?: string
          is_info_only?: boolean | null
          organization_id?: string
          phase?: string | null
          project_id?: string
          sort_order?: number
          start_date?: string | null
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
            foreignKeyName: "project_tasks_dependency_task_id_fkey"
            columns: ["dependency_task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_execution_task_id_fkey"
            columns: ["execution_task_id"]
            isOneToOne: false
            referencedRelation: "establishment_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          address_geofence_mode: string | null
          address_geofence_polygon: Json | null
          address_radius_meters: number | null
          booking_id: string | null
          client: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          customer_pickup: boolean
          deleted_at: string | null
          delivery_city: string | null
          delivery_latitude: number | null
          delivery_longitude: number | null
          delivery_postal_code: string | null
          deliveryaddress: string | null
          description: string | null
          event_end_time: string | null
          event_start_time: string | null
          eventdate: string | null
          id: string
          internalnotes: string | null
          is_internal: boolean
          location_id: string | null
          name: string
          organization_id: string
          planning_status: Database["public"]["Enums"]["project_planning_status"]
          project_leader: string | null
          rig_end_time: string | null
          rig_start_time: string | null
          rigdaydate: string | null
          rigdown_end_time: string | null
          rigdown_start_time: string | null
          rigdowndate: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address_geofence_mode?: string | null
          address_geofence_polygon?: Json | null
          address_radius_meters?: number | null
          booking_id?: string | null
          client?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          customer_pickup?: boolean
          deleted_at?: string | null
          delivery_city?: string | null
          delivery_latitude?: number | null
          delivery_longitude?: number | null
          delivery_postal_code?: string | null
          deliveryaddress?: string | null
          description?: string | null
          event_end_time?: string | null
          event_start_time?: string | null
          eventdate?: string | null
          id?: string
          internalnotes?: string | null
          is_internal?: boolean
          location_id?: string | null
          name: string
          organization_id?: string
          planning_status?: Database["public"]["Enums"]["project_planning_status"]
          project_leader?: string | null
          rig_end_time?: string | null
          rig_start_time?: string | null
          rigdaydate?: string | null
          rigdown_end_time?: string | null
          rigdown_start_time?: string | null
          rigdowndate?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address_geofence_mode?: string | null
          address_geofence_polygon?: Json | null
          address_radius_meters?: number | null
          booking_id?: string | null
          client?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          customer_pickup?: boolean
          deleted_at?: string | null
          delivery_city?: string | null
          delivery_latitude?: number | null
          delivery_longitude?: number | null
          delivery_postal_code?: string | null
          deliveryaddress?: string | null
          description?: string | null
          event_end_time?: string | null
          event_start_time?: string | null
          eventdate?: string | null
          id?: string
          internalnotes?: string | null
          is_internal?: boolean
          location_id?: string | null
          name?: string
          organization_id?: string
          planning_status?: Database["public"]["Enums"]["project_planning_status"]
          project_leader?: string | null
          rig_end_time?: string | null
          rig_start_time?: string | null
          rigdaydate?: string | null
          rigdown_end_time?: string | null
          rigdown_start_time?: string | null
          rigdowndate?: string | null
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
          {
            foreignKeyName: "projects_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "organization_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      push_notification_log: {
        Row: {
          body: string
          data: Json | null
          error_message: string | null
          id: string
          notification_type: string
          organization_id: string
          sent_at: string
          staff_id: string
          success: boolean
          title: string
        }
        Insert: {
          body: string
          data?: Json | null
          error_message?: string | null
          id?: string
          notification_type: string
          organization_id?: string
          sent_at?: string
          staff_id: string
          success?: boolean
          title: string
        }
        Update: {
          body?: string
          data?: Json | null
          error_message?: string | null
          id?: string
          notification_type?: string
          organization_id?: string
          sent_at?: string
          staff_id?: string
          success?: boolean
          title?: string
        }
        Relationships: []
      }
      staff_accounts: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          password_hash: string
          staff_id: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string
          password_hash: string
          staff_id: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          password_hash?: string
          staff_id?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_accounts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_app_health_events: {
        Row: {
          app_build: string | null
          app_id: string | null
          app_state: string | null
          app_version: string | null
          battery_level: number | null
          battery_percent: number | null
          created_at: string
          device_model: string | null
          event_type: string
          id: string
          is_charging: boolean | null
          metadata: Json
          occurred_at: string
          organization_id: string
          os_version: string | null
          platform: string | null
          staff_id: string
        }
        Insert: {
          app_build?: string | null
          app_id?: string | null
          app_state?: string | null
          app_version?: string | null
          battery_level?: number | null
          battery_percent?: number | null
          created_at?: string
          device_model?: string | null
          event_type: string
          id?: string
          is_charging?: boolean | null
          metadata?: Json
          occurred_at: string
          organization_id: string
          os_version?: string | null
          platform?: string | null
          staff_id: string
        }
        Update: {
          app_build?: string | null
          app_id?: string | null
          app_state?: string | null
          app_version?: string | null
          battery_level?: number | null
          battery_percent?: number | null
          created_at?: string
          device_model?: string | null
          event_type?: string
          id?: string
          is_charging?: boolean | null
          metadata?: Json
          occurred_at?: string
          organization_id?: string
          os_version?: string | null
          platform?: string | null
          staff_id?: string
        }
        Relationships: []
      }
      staff_assignments: {
        Row: {
          assignment_date: string
          created_at: string
          id: string
          organization_id: string
          staff_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          assignment_date: string
          created_at?: string
          id?: string
          organization_id?: string
          staff_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          assignment_date?: string
          created_at?: string
          id?: string
          organization_id?: string
          staff_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
          staff_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_availability_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_availability_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_day_decision_log: {
        Row: {
          action: string
          actor: string
          after: Json | null
          before: Json | null
          confidence: number | null
          created_at: string
          day_date: string
          id: string
          organization_id: string
          reason: string | null
          segment_id: string | null
          source_function: string | null
          staff_id: string
        }
        Insert: {
          action: string
          actor: string
          after?: Json | null
          before?: Json | null
          confidence?: number | null
          created_at?: string
          day_date: string
          id?: string
          organization_id: string
          reason?: string | null
          segment_id?: string | null
          source_function?: string | null
          staff_id: string
        }
        Update: {
          action?: string
          actor?: string
          after?: Json | null
          before?: Json | null
          confidence?: number | null
          created_at?: string
          day_date?: string
          id?: string
          organization_id?: string
          reason?: string | null
          segment_id?: string | null
          source_function?: string | null
          staff_id?: string
        }
        Relationships: []
      }
      staff_day_rebuild_queue: {
        Row: {
          attempts: number
          completed_at: string | null
          day_date: string
          id: string
          last_error: string | null
          organization_id: string
          reason: string
          requested_at: string
          requested_by: string | null
          staff_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          day_date: string
          id?: string
          last_error?: string | null
          organization_id: string
          reason: string
          requested_at?: string
          requested_by?: string | null
          staff_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          day_date?: string
          id?: string
          last_error?: string | null
          organization_id?: string
          reason?: string
          requested_at?: string
          requested_by?: string | null
          staff_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      staff_day_report_cache: {
        Row: {
          ai_review_at: string | null
          ai_review_pending: boolean
          ai_review_signature: string | null
          built_at: string
          created_at: string
          date: string
          diagnostics_json: Json
          display_blocks_json: Json
          engine_version: string
          error: string | null
          id: string
          organization_id: string
          processed_until: string | null
          report_candidate_blocks_json: Json
          source_watermark: Json
          staff_id: string
          stale: boolean
          summary_json: Json
          updated_at: string
        }
        Insert: {
          ai_review_at?: string | null
          ai_review_pending?: boolean
          ai_review_signature?: string | null
          built_at?: string
          created_at?: string
          date: string
          diagnostics_json?: Json
          display_blocks_json?: Json
          engine_version: string
          error?: string | null
          id?: string
          organization_id: string
          processed_until?: string | null
          report_candidate_blocks_json?: Json
          source_watermark?: Json
          staff_id: string
          stale?: boolean
          summary_json?: Json
          updated_at?: string
        }
        Update: {
          ai_review_at?: string | null
          ai_review_pending?: boolean
          ai_review_signature?: string | null
          built_at?: string
          created_at?: string
          date?: string
          diagnostics_json?: Json
          display_blocks_json?: Json
          engine_version?: string
          error?: string | null
          id?: string
          organization_id?: string
          processed_until?: string | null
          report_candidate_blocks_json?: Json
          source_watermark?: Json
          staff_id?: string
          stale?: boolean
          summary_json?: Json
          updated_at?: string
        }
        Relationships: []
      }
      staff_day_submission_messages: {
        Row: {
          author_id: string | null
          author_role: string
          body: string
          created_at: string
          date: string
          id: string
          organization_id: string
          staff_id: string
          submission_id: string
        }
        Insert: {
          author_id?: string | null
          author_role: string
          body: string
          created_at?: string
          date: string
          id?: string
          organization_id: string
          staff_id: string
          submission_id: string
        }
        Update: {
          author_id?: string | null
          author_role?: string
          body?: string
          created_at?: string
          date?: string
          id?: string
          organization_id?: string
          staff_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_day_submission_messages_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "staff_day_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_day_submissions: {
        Row: {
          ai_validation_json: Json | null
          break_minutes: number
          comment: string | null
          correction_requested_at: string | null
          correction_requested_by: string | null
          created_at: string
          date: string
          display_timeline_snapshot_json: Json | null
          end_time: string | null
          engine_version: string | null
          id: string
          organization_id: string
          requested_end_at: string | null
          requested_start_at: string | null
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string | null
          source_snapshot_id: string | null
          source_summary_json: Json | null
          staff_id: string
          start_time: string | null
          status: string
          submitted_at: string
          submitted_by: string | null
          submitted_payload_json: Json | null
          updated_at: string
          user_edits_json: Json | null
        }
        Insert: {
          ai_validation_json?: Json | null
          break_minutes?: number
          comment?: string | null
          correction_requested_at?: string | null
          correction_requested_by?: string | null
          created_at?: string
          date: string
          display_timeline_snapshot_json?: Json | null
          end_time?: string | null
          engine_version?: string | null
          id?: string
          organization_id: string
          requested_end_at?: string | null
          requested_start_at?: string | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string | null
          source_snapshot_id?: string | null
          source_summary_json?: Json | null
          staff_id: string
          start_time?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          submitted_payload_json?: Json | null
          updated_at?: string
          user_edits_json?: Json | null
        }
        Update: {
          ai_validation_json?: Json | null
          break_minutes?: number
          comment?: string | null
          correction_requested_at?: string | null
          correction_requested_by?: string | null
          created_at?: string
          date?: string
          display_timeline_snapshot_json?: Json | null
          end_time?: string | null
          engine_version?: string | null
          id?: string
          organization_id?: string
          requested_end_at?: string | null
          requested_start_at?: string | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string | null
          source_snapshot_id?: string | null
          source_summary_json?: Json | null
          staff_id?: string
          start_time?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          submitted_payload_json?: Json | null
          updated_at?: string
          user_edits_json?: Json | null
        }
        Relationships: []
      }
      staff_gps_day_anchors: {
        Row: {
          anchor_type: string
          confirmation_mode: string
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          date: string
          id: string
          organization_id: string
          reason: string | null
          source: string
          staff_id: string
          suggested_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          anchor_type: string
          confirmation_mode?: string
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          organization_id: string
          reason?: string | null
          source?: string
          staff_id: string
          suggested_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          anchor_type?: string
          confirmation_mode?: string
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          organization_id?: string
          reason?: string | null
          source?: string
          staff_id?: string
          suggested_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      staff_gps_day_snapshots: {
        Row: {
          built_at: string
          date: string
          input_signature: string
          organization_id: string
          snapshot: Json
          staff_id: string
        }
        Insert: {
          built_at?: string
          date: string
          input_signature: string
          organization_id: string
          snapshot: Json
          staff_id: string
        }
        Update: {
          built_at?: string
          date?: string
          input_signature?: string
          organization_id?: string
          snapshot?: Json
          staff_id?: string
        }
        Relationships: []
      }
      staff_home_observations: {
        Row: {
          cluster_key: string
          created_at: string
          dwell_minutes: number
          id: string
          lat: number
          lng: number
          observed_date: string
          organization_id: string
          staff_id: string
        }
        Insert: {
          cluster_key: string
          created_at?: string
          dwell_minutes?: number
          id?: string
          lat: number
          lng: number
          observed_date: string
          organization_id: string
          staff_id: string
        }
        Update: {
          cluster_key?: string
          created_at?: string
          dwell_minutes?: number
          id?: string
          lat?: number
          lng?: number
          observed_date?: string
          organization_id?: string
          staff_id?: string
        }
        Relationships: []
      }
      staff_inferred_home_locations: {
        Row: {
          cluster_key: string
          confidence: number
          created_at: string
          id: string
          kind: string
          last_observed_at: string
          lat: number
          lng: number
          nights_observed: number
          organization_id: string
          radius_m: number
          staff_id: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          cluster_key: string
          confidence?: number
          created_at?: string
          id?: string
          kind: string
          last_observed_at?: string
          lat: number
          lng: number
          nights_observed?: number
          organization_id: string
          radius_m?: number
          staff_id: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          cluster_key?: string
          confidence?: number
          created_at?: string
          id?: string
          kind?: string
          last_observed_at?: string
          lat?: number
          lng?: number
          nights_observed?: number
          organization_id?: string
          radius_m?: number
          staff_id?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      staff_job_affinity: {
        Row: {
          affinity_score: number | null
          avg_efficiency_score: number | null
          created_at: string
          id: string
          jobs_completed: number | null
          last_job_date: string | null
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
          product_category?: string
          staff_id?: string
          staff_name?: string
          total_hours_on_category?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_job_affinity_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_location_history: {
        Row: {
          accuracy: number | null
          app_build: string | null
          app_id: string | null
          app_version: string | null
          battery_captured_at: string | null
          battery_level: number | null
          battery_percent: number | null
          battery_source: string | null
          created_at: string
          device_model: string | null
          id: string
          is_charging: boolean | null
          lat: number
          lng: number
          organization_id: string
          os_version: string | null
          platform: string | null
          recorded_at: string
          speed: number | null
          staff_id: string
          time_report_id: string | null
        }
        Insert: {
          accuracy?: number | null
          app_build?: string | null
          app_id?: string | null
          app_version?: string | null
          battery_captured_at?: string | null
          battery_level?: number | null
          battery_percent?: number | null
          battery_source?: string | null
          created_at?: string
          device_model?: string | null
          id?: string
          is_charging?: boolean | null
          lat: number
          lng: number
          organization_id: string
          os_version?: string | null
          platform?: string | null
          recorded_at: string
          speed?: number | null
          staff_id: string
          time_report_id?: string | null
        }
        Update: {
          accuracy?: number | null
          app_build?: string | null
          app_id?: string | null
          app_version?: string | null
          battery_captured_at?: string | null
          battery_level?: number | null
          battery_percent?: number | null
          battery_source?: string | null
          created_at?: string
          device_model?: string | null
          id?: string
          is_charging?: boolean | null
          lat?: number
          lng?: number
          organization_id?: string
          os_version?: string | null
          platform?: string | null
          recorded_at?: string
          speed?: number | null
          staff_id?: string
          time_report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_location_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_location_history_time_report_id_fkey"
            columns: ["time_report_id"]
            isOneToOne: false
            referencedRelation: "time_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_locations: {
        Row: {
          accuracy: number | null
          app_build: string | null
          app_platform: string | null
          app_version: string | null
          battery_percent: number | null
          is_charging: boolean | null
          last_address: string | null
          last_address_at: string | null
          last_address_lat: number | null
          last_address_lng: number | null
          latitude: number
          location_since: string | null
          longitude: number
          organization_id: string
          speed: number | null
          staff_id: string
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          app_build?: string | null
          app_platform?: string | null
          app_version?: string | null
          battery_percent?: number | null
          is_charging?: boolean | null
          last_address?: string | null
          last_address_at?: string | null
          last_address_lat?: number | null
          last_address_lng?: number | null
          latitude: number
          location_since?: string | null
          longitude: number
          organization_id?: string
          speed?: number | null
          staff_id: string
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          app_build?: string | null
          app_platform?: string | null
          app_version?: string | null
          battery_percent?: number | null
          is_charging?: boolean | null
          last_address?: string | null
          last_address_at?: string | null
          last_address_lat?: number | null
          last_address_lng?: number | null
          latitude?: number
          location_since?: string | null
          longitude?: number
          organization_id?: string
          speed?: number | null
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_locations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
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
          driver_license_url: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employment_type: string
          hire_date: string | null
          hired_from_supplier_id: string | null
          hourly_rate: number | null
          id: string
          is_active: boolean
          jacket_size: string | null
          name: string
          notes: string | null
          organization_id: string
          overtime_rate: number | null
          pants_size: string | null
          phone: string | null
          postal_code: string | null
          role: string | null
          salary: number | null
          shoe_size: string | null
          sweater_size: string | null
          tags: string[]
          tshirt_size: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          color?: string | null
          created_at?: string
          department?: string | null
          driver_license_url?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employment_type?: string
          hire_date?: string | null
          hired_from_supplier_id?: string | null
          hourly_rate?: number | null
          id: string
          is_active?: boolean
          jacket_size?: string | null
          name: string
          notes?: string | null
          organization_id?: string
          overtime_rate?: number | null
          pants_size?: string | null
          phone?: string | null
          postal_code?: string | null
          role?: string | null
          salary?: number | null
          shoe_size?: string | null
          sweater_size?: string | null
          tags?: string[]
          tshirt_size?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          color?: string | null
          created_at?: string
          department?: string | null
          driver_license_url?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employment_type?: string
          hire_date?: string | null
          hired_from_supplier_id?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          jacket_size?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          overtime_rate?: number | null
          pants_size?: string | null
          phone?: string | null
          postal_code?: string | null
          role?: string | null
          salary?: number | null
          shoe_size?: string | null
          sweater_size?: string | null
          tags?: string[]
          tshirt_size?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_members_hired_from_supplier_id_fkey"
            columns: ["hired_from_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_messages: {
        Row: {
          booking_id: string | null
          content: string
          created_at: string
          id: string
          is_read: boolean
          message_type: string
          organization_id: string
          sender_name: string | null
          sender_type: string
          staff_id: string
          staff_name: string
        }
        Insert: {
          booking_id?: string | null
          content: string
          created_at?: string
          id?: string
          is_read?: boolean
          message_type?: string
          organization_id?: string
          sender_name?: string | null
          sender_type?: string
          staff_id: string
          staff_name: string
        }
        Update: {
          booking_id?: string | null
          content?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message_type?: string
          organization_id?: string
          sender_name?: string | null
          sender_type?: string
          staff_id?: string
          staff_name?: string
        }
        Relationships: []
      }
      staff_payroll_period_days: {
        Row: {
          day_submission_id: string
          id: string
          included_at: string
          organization_id: string
          payroll_period_id: string
          report_date: string
          staff_id: string
        }
        Insert: {
          day_submission_id: string
          id?: string
          included_at?: string
          organization_id: string
          payroll_period_id: string
          report_date: string
          staff_id: string
        }
        Update: {
          day_submission_id?: string
          id?: string
          included_at?: string
          organization_id?: string
          payroll_period_id?: string
          report_date?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_payroll_period_days_day_submission_id_fkey"
            columns: ["day_submission_id"]
            isOneToOne: false
            referencedRelation: "staff_day_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_payroll_period_days_payroll_period_id_fkey"
            columns: ["payroll_period_id"]
            isOneToOne: false
            referencedRelation: "staff_payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_payroll_periods: {
        Row: {
          approved_for_payout_at: string | null
          approved_for_payout_by: string | null
          created_at: string
          id: string
          name: string | null
          organization_id: string
          period_end: string
          period_start: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_for_payout_at?: string | null
          approved_for_payout_by?: string | null
          created_at?: string
          id?: string
          name?: string | null
          organization_id: string
          period_end: string
          period_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_for_payout_at?: string | null
          approved_for_payout_by?: string | null
          created_at?: string
          id?: string
          name?: string | null
          organization_id?: string
          period_end?: string
          period_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_presence_events: {
        Row: {
          confidence: number | null
          created_at: string
          event_at: string
          event_type: string
          gps_segment_id: string | null
          id: string
          metadata: Json
          organization_id: string
          source: string
          staff_id: string
          target_id: string | null
          target_label: string | null
          target_type: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          event_at: string
          event_type: string
          gps_segment_id?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          source?: string
          staff_id: string
          target_id?: string | null
          target_label?: string | null
          target_type: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          event_at?: string
          event_type?: string
          gps_segment_id?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          source?: string
          staff_id?: string
          target_id?: string | null
          target_label?: string | null
          target_type?: string
        }
        Relationships: []
      }
      staff_private_zones: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          kind: string
          label: string | null
          lat: number
          lng: number
          notes: string | null
          organization_id: string
          radius_m: number
          source: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          label?: string | null
          lat: number
          lng: number
          notes?: string | null
          organization_id: string
          radius_m?: number
          source?: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          label?: string | null
          lat?: number
          lng?: number
          notes?: string | null
          organization_id?: string
          radius_m?: number
          source?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_time_learning_rules: {
        Row: {
          active: boolean
          booking_id: string | null
          confidence: number
          created_by: string
          human_readable: string
          id: string
          large_project_id: string | null
          last_used_at: string | null
          learned_at: string
          notes: string | null
          organization_id: string
          pattern_data: Json
          pattern_type: string
          project_id: string | null
          rejected_count: number
          scope: string
          staff_id: string | null
          superseded_by: string | null
          verified_count: number
        }
        Insert: {
          active?: boolean
          booking_id?: string | null
          confidence?: number
          created_by?: string
          human_readable: string
          id?: string
          large_project_id?: string | null
          last_used_at?: string | null
          learned_at?: string
          notes?: string | null
          organization_id: string
          pattern_data?: Json
          pattern_type: string
          project_id?: string | null
          rejected_count?: number
          scope: string
          staff_id?: string | null
          superseded_by?: string | null
          verified_count?: number
        }
        Update: {
          active?: boolean
          booking_id?: string | null
          confidence?: number
          created_by?: string
          human_readable?: string
          id?: string
          large_project_id?: string | null
          last_used_at?: string | null
          learned_at?: string
          notes?: string | null
          organization_id?: string
          pattern_data?: Json
          pattern_type?: string
          project_id?: string | null
          rejected_count?: number
          scope?: string
          staff_id?: string | null
          superseded_by?: string | null
          verified_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_time_learning_rules_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "staff_time_learning_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_wake_requests: {
        Row: {
          context: Json | null
          dispatch_status: string | null
          id: string
          organization_id: string
          reason: string
          requested_at: string
          silence_ms: number | null
          source: string
          staff_id: string
        }
        Insert: {
          context?: Json | null
          dispatch_status?: string | null
          id?: string
          organization_id: string
          reason: string
          requested_at?: string
          silence_ms?: number | null
          source?: string
          staff_id: string
        }
        Update: {
          context?: Json | null
          dispatch_status?: string | null
          id?: string
          organization_id?: string
          reason?: string
          requested_at?: string
          silence_ms?: number | null
          source?: string
          staff_id?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          color: string | null
          contacts: Json
          country: string | null
          created_at: string
          email: string | null
          external_id: string | null
          id: string
          last_synced_at: string | null
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          postal_code: string | null
          primary_contact: Json | null
          short_name: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          color?: string | null
          contacts?: Json
          country?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          id?: string
          last_synced_at?: string | null
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          postal_code?: string | null
          primary_contact?: Json | null
          short_name?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          color?: string | null
          contacts?: Json
          country?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          id?: string
          last_synced_at?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          postal_code?: string | null
          primary_contact?: Json | null
          short_name?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      sync_audit_log: {
        Row: {
          actual_events: Json | null
          booking_dates: Json | null
          booking_id: string
          booking_status: string | null
          created_at: string
          error_message: string | null
          events_created: number | null
          events_deleted: number | null
          events_updated: number | null
          expected_events: Json | null
          has_mismatch: boolean | null
          id: string
          mismatch_details: string | null
          organization_id: string
          sync_action: string
        }
        Insert: {
          actual_events?: Json | null
          booking_dates?: Json | null
          booking_id: string
          booking_status?: string | null
          created_at?: string
          error_message?: string | null
          events_created?: number | null
          events_deleted?: number | null
          events_updated?: number | null
          expected_events?: Json | null
          has_mismatch?: boolean | null
          id?: string
          mismatch_details?: string | null
          organization_id: string
          sync_action: string
        }
        Update: {
          actual_events?: Json | null
          booking_dates?: Json | null
          booking_id?: string
          booking_status?: string | null
          created_at?: string
          error_message?: string | null
          events_created?: number | null
          events_deleted?: number | null
          events_updated?: number | null
          expected_events?: Json | null
          has_mismatch?: boolean | null
          id?: string
          mismatch_details?: string | null
          organization_id?: string
          sync_action?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_state: {
        Row: {
          created_at: string
          id: string
          last_sync_mode: string | null
          last_sync_status: string | null
          last_sync_timestamp: string | null
          metadata: Json | null
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
          sync_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_state_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string | null
          author_name: string
          content: string
          created_at: string
          id: string
          organization_id: string
          task_id: string
        }
        Insert: {
          author_id?: string | null
          author_name: string
          content: string
          created_at?: string
          id?: string
          organization_id?: string
          task_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          organization_id?: string
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
            foreignKeyName: "task_comments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      time_auto_start_suppressions: {
        Row: {
          created_at: string
          date: string
          id: string
          metadata: Json
          organization_id: string
          reason: string
          source: string
          staff_id: string
          suppressed_until: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          metadata?: Json
          organization_id: string
          reason: string
          source: string
          staff_id: string
          suppressed_until: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          metadata?: Json
          organization_id?: string
          reason?: string
          source?: string
          staff_id?: string
          suppressed_until?: string
        }
        Relationships: []
      }
      time_registration_segments: {
        Row: {
          confidence: number
          created_at: string
          ended_at: string | null
          id: string
          kind: string
          label: string
          organization_id: string
          registration_id: string
          source_gps_segment_id: string | null
          staff_id: string
          started_at: string
          target_key: string | null
          target_kind: string | null
          target_ref_id: string | null
          updated_at: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          ended_at?: string | null
          id?: string
          kind: string
          label: string
          organization_id: string
          registration_id: string
          source_gps_segment_id?: string | null
          staff_id: string
          started_at: string
          target_key?: string | null
          target_kind?: string | null
          target_ref_id?: string | null
          updated_at?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          ended_at?: string | null
          id?: string
          kind?: string
          label?: string
          organization_id?: string
          registration_id?: string
          source_gps_segment_id?: string | null
          staff_id?: string
          started_at?: string
          target_key?: string | null
          target_kind?: string | null
          target_ref_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_registration_segments_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "active_time_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      time_report_ai_block_audit: {
        Row: {
          ai_result_json: Json | null
          applied_kind: string | null
          block_id: string
          cache_id: string
          confidence_score: number | null
          created_at: string
          date: string
          engine_version: string
          evidence_used_json: Json | null
          id: string
          is_current: boolean
          model_version: string | null
          organization_id: string
          original_block_json: Json | null
          reasoning_summary: string | null
          safety_flags_json: Json | null
          staff_id: string
          status: string
          suggested_kind: string | null
          updated_block_json: Json | null
        }
        Insert: {
          ai_result_json?: Json | null
          applied_kind?: string | null
          block_id: string
          cache_id: string
          confidence_score?: number | null
          created_at?: string
          date: string
          engine_version: string
          evidence_used_json?: Json | null
          id?: string
          is_current?: boolean
          model_version?: string | null
          organization_id: string
          original_block_json?: Json | null
          reasoning_summary?: string | null
          safety_flags_json?: Json | null
          staff_id: string
          status: string
          suggested_kind?: string | null
          updated_block_json?: Json | null
        }
        Update: {
          ai_result_json?: Json | null
          applied_kind?: string | null
          block_id?: string
          cache_id?: string
          confidence_score?: number | null
          created_at?: string
          date?: string
          engine_version?: string
          evidence_used_json?: Json | null
          id?: string
          is_current?: boolean
          model_version?: string | null
          organization_id?: string
          original_block_json?: Json | null
          reasoning_summary?: string | null
          safety_flags_json?: Json | null
          staff_id?: string
          status?: string
          suggested_kind?: string | null
          updated_block_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "time_report_ai_block_audit_cache_id_fkey"
            columns: ["cache_id"]
            isOneToOne: false
            referencedRelation: "staff_day_report_cache"
            referencedColumns: ["id"]
          },
        ]
      }
      time_report_ai_reviews: {
        Row: {
          admin_feedback: string | null
          ai_model: string | null
          ai_raw_response: Json | null
          block_id: string
          concerns_json: Json
          confidence: string | null
          confidence_score: number | null
          created_at: string
          current_classification: string | null
          current_confidence: string | null
          current_kind: string | null
          date: string
          engine_version: string | null
          evidence_json: Json
          evidence_used_json: Json
          id: string
          organization_id: string
          reasoning_summary: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          staff_id: string
          suggested_action_json: Json
          suggested_classification: string | null
          suggested_kind: string | null
          suggested_label: string | null
          suggested_minutes: number | null
          updated_at: string
        }
        Insert: {
          admin_feedback?: string | null
          ai_model?: string | null
          ai_raw_response?: Json | null
          block_id: string
          concerns_json?: Json
          confidence?: string | null
          confidence_score?: number | null
          created_at?: string
          current_classification?: string | null
          current_confidence?: string | null
          current_kind?: string | null
          date: string
          engine_version?: string | null
          evidence_json?: Json
          evidence_used_json?: Json
          id?: string
          organization_id: string
          reasoning_summary?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id: string
          suggested_action_json?: Json
          suggested_classification?: string | null
          suggested_kind?: string | null
          suggested_label?: string | null
          suggested_minutes?: number | null
          updated_at?: string
        }
        Update: {
          admin_feedback?: string | null
          ai_model?: string | null
          ai_raw_response?: Json | null
          block_id?: string
          concerns_json?: Json
          confidence?: string | null
          confidence_score?: number | null
          created_at?: string
          current_classification?: string | null
          current_confidence?: string | null
          current_kind?: string | null
          date?: string
          engine_version?: string | null
          evidence_json?: Json
          evidence_used_json?: Json
          id?: string
          organization_id?: string
          reasoning_summary?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string
          suggested_action_json?: Json
          suggested_classification?: string | null
          suggested_kind?: string | null
          suggested_label?: string | null
          suggested_minutes?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      time_report_anomalies: {
        Row: {
          auto_classified: boolean
          booking_id: string | null
          classification:
            | Database["public"]["Enums"]["anomaly_classification"]
            | null
          classified_at: string | null
          created_at: string
          duration_minutes: number | null
          end_location_lat: number | null
          end_location_lng: number | null
          end_location_recorded_at: string | null
          ended_at: string | null
          id: string
          large_project_id: string | null
          location_id: string | null
          organization_id: string
          source: string
          staff_id: string
          started_at: string
          time_report_id: string | null
          updated_at: string
          work_description: string | null
        }
        Insert: {
          auto_classified?: boolean
          booking_id?: string | null
          classification?:
            | Database["public"]["Enums"]["anomaly_classification"]
            | null
          classified_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          end_location_lat?: number | null
          end_location_lng?: number | null
          end_location_recorded_at?: string | null
          ended_at?: string | null
          id?: string
          large_project_id?: string | null
          location_id?: string | null
          organization_id: string
          source?: string
          staff_id: string
          started_at?: string
          time_report_id?: string | null
          updated_at?: string
          work_description?: string | null
        }
        Update: {
          auto_classified?: boolean
          booking_id?: string | null
          classification?:
            | Database["public"]["Enums"]["anomaly_classification"]
            | null
          classified_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          end_location_lat?: number | null
          end_location_lng?: number | null
          end_location_recorded_at?: string | null
          ended_at?: string | null
          id?: string
          large_project_id?: string | null
          location_id?: string | null
          organization_id?: string
          source?: string
          staff_id?: string
          started_at?: string
          time_report_id?: string | null
          updated_at?: string
          work_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_report_anomalies_large_project_id_fkey"
            columns: ["large_project_id"]
            isOneToOne: false
            referencedRelation: "large_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_report_anomalies_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "organization_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_report_anomalies_time_report_id_fkey"
            columns: ["time_report_id"]
            isOneToOne: false
            referencedRelation: "time_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      time_report_correction_suggestions: {
        Row: {
          ai_model: string | null
          ai_reasoning: string | null
          ai_verdict: string | null
          applied_at: string | null
          applied_by_ai: boolean
          apply_rule: string | null
          computed_at: string
          confidence: number
          difference_min: number | null
          engine_version: string
          human_readable_text: string
          id: string
          learning_rule_ids: string[]
          organization_id: string
          original_end_time: string | null
          original_start_time: string | null
          reason: string
          report_date: string
          resolution_payload: Json | null
          resolved_action: string | null
          resolved_at: string | null
          resolved_by: string | null
          staff_id: string
          status: string
          suggested_duration_min: number | null
          suggested_end_time: string | null
          suggested_start_time: string | null
          suggestion_type: string
          target_booking_id: string | null
          target_location_id: string | null
          target_project_id: string | null
          time_report_id: string
          undo_payload: Json | null
        }
        Insert: {
          ai_model?: string | null
          ai_reasoning?: string | null
          ai_verdict?: string | null
          applied_at?: string | null
          applied_by_ai?: boolean
          apply_rule?: string | null
          computed_at?: string
          confidence?: number
          difference_min?: number | null
          engine_version?: string
          human_readable_text: string
          id?: string
          learning_rule_ids?: string[]
          organization_id: string
          original_end_time?: string | null
          original_start_time?: string | null
          reason: string
          report_date: string
          resolution_payload?: Json | null
          resolved_action?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          staff_id: string
          status?: string
          suggested_duration_min?: number | null
          suggested_end_time?: string | null
          suggested_start_time?: string | null
          suggestion_type: string
          target_booking_id?: string | null
          target_location_id?: string | null
          target_project_id?: string | null
          time_report_id: string
          undo_payload?: Json | null
        }
        Update: {
          ai_model?: string | null
          ai_reasoning?: string | null
          ai_verdict?: string | null
          applied_at?: string | null
          applied_by_ai?: boolean
          apply_rule?: string | null
          computed_at?: string
          confidence?: number
          difference_min?: number | null
          engine_version?: string
          human_readable_text?: string
          id?: string
          learning_rule_ids?: string[]
          organization_id?: string
          original_end_time?: string | null
          original_start_time?: string | null
          reason?: string
          report_date?: string
          resolution_payload?: Json | null
          resolved_action?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          staff_id?: string
          status?: string
          suggested_duration_min?: number | null
          suggested_end_time?: string | null
          suggested_start_time?: string | null
          suggestion_type?: string
          target_booking_id?: string | null
          target_location_id?: string | null
          target_project_id?: string | null
          time_report_id?: string
          undo_payload?: Json | null
        }
        Relationships: []
      }
      time_report_edit_log: {
        Row: {
          created_at: string
          edited_by_id: string | null
          edited_by_name: string
          edited_by_type: string
          id: string
          new_values: Json
          organization_id: string
          previous_values: Json
          time_report_id: string
        }
        Insert: {
          created_at?: string
          edited_by_id?: string | null
          edited_by_name: string
          edited_by_type?: string
          id?: string
          new_values?: Json
          organization_id: string
          previous_values?: Json
          time_report_id: string
        }
        Update: {
          created_at?: string
          edited_by_id?: string | null
          edited_by_name?: string
          edited_by_type?: string
          id?: string
          new_values?: Json
          organization_id?: string
          previous_values?: Json
          time_report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_report_edit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_report_edit_log_time_report_id_fkey"
            columns: ["time_report_id"]
            isOneToOne: false
            referencedRelation: "time_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      time_reports: {
        Row: {
          approved: boolean | null
          approved_at: string | null
          approved_by: string | null
          booking_id: string | null
          break_time: number | null
          created_at: string
          day_timeline_block_key: string | null
          description: string | null
          end_time: string | null
          establishment_task_id: string | null
          hours_worked: number
          id: string
          is_subdivision: boolean
          large_project_id: string | null
          location_id: string | null
          organization_id: string
          overtime_hours: number | null
          parent_time_report_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_comment: string | null
          report_date: string
          source: string
          source_entry_id: string | null
          staff_id: string
          start_time: string | null
          updated_at: string
        }
        Insert: {
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          booking_id?: string | null
          break_time?: number | null
          created_at?: string
          day_timeline_block_key?: string | null
          description?: string | null
          end_time?: string | null
          establishment_task_id?: string | null
          hours_worked?: number
          id?: string
          is_subdivision?: boolean
          large_project_id?: string | null
          location_id?: string | null
          organization_id?: string
          overtime_hours?: number | null
          parent_time_report_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_comment?: string | null
          report_date: string
          source?: string
          source_entry_id?: string | null
          staff_id: string
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          booking_id?: string | null
          break_time?: number | null
          created_at?: string
          day_timeline_block_key?: string | null
          description?: string | null
          end_time?: string | null
          establishment_task_id?: string | null
          hours_worked?: number
          id?: string
          is_subdivision?: boolean
          large_project_id?: string | null
          location_id?: string | null
          organization_id?: string
          overtime_hours?: number | null
          parent_time_report_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_comment?: string | null
          report_date?: string
          source?: string
          source_entry_id?: string | null
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
            foreignKeyName: "time_reports_establishment_task_id_fkey"
            columns: ["establishment_task_id"]
            isOneToOne: false
            referencedRelation: "establishment_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_reports_large_project_id_fkey"
            columns: ["large_project_id"]
            isOneToOne: false
            referencedRelation: "large_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_reports_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "organization_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_reports_parent_time_report_id_fkey"
            columns: ["parent_time_report_id"]
            isOneToOne: false
            referencedRelation: "time_reports"
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
      timeline_action_audit: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          id: string
          organization_id: string
          payload: Json
          report_date: string
          staff_id: string
          suggestion_id: string | null
          time_report_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          id?: string
          organization_id: string
          payload?: Json
          report_date: string
          staff_id: string
          suggestion_id?: string | null
          time_report_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          payload?: Json
          report_date?: string
          staff_id?: string
          suggestion_id?: string | null
          time_report_id?: string | null
        }
        Relationships: []
      }
      todo_types: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_builtin: boolean
          key: string
          label: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_builtin?: boolean
          key: string
          label: string
          organization_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_builtin?: boolean
          key?: string
          label?: string
          organization_id?: string
        }
        Relationships: []
      }
      todos: {
        Row: {
          address: string | null
          assigned_leader: string | null
          booking_id: string | null
          city: string | null
          client: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          end_time: string | null
          id: string
          internal_notes: string | null
          large_project_id: string | null
          latitude: number | null
          longitude: number | null
          organization_id: string
          planning_status: string
          postal_code: string | null
          scheduled_date: string | null
          start_time: string | null
          title: string
          type_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          assigned_leader?: string | null
          booking_id?: string | null
          city?: string | null
          client?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          id?: string
          internal_notes?: string | null
          large_project_id?: string | null
          latitude?: number | null
          longitude?: number | null
          organization_id: string
          planning_status?: string
          postal_code?: string | null
          scheduled_date?: string | null
          start_time?: string | null
          title: string
          type_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          assigned_leader?: string | null
          booking_id?: string | null
          city?: string | null
          client?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          id?: string
          internal_notes?: string | null
          large_project_id?: string | null
          latitude?: number | null
          longitude?: number | null
          organization_id?: string
          planning_status?: string
          postal_code?: string | null
          scheduled_date?: string | null
          start_time?: string | null
          title?: string
          type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "todos_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "confirmed_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_large_project_id_fkey"
            columns: ["large_project_id"]
            isOneToOne: false
            referencedRelation: "large_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "todo_types"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_boost_dismissals: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          organization_id: string
          reason: string | null
          staff_id: string
          target_key: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          organization_id: string
          reason?: string | null
          staff_id: string
          target_key: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string
          reason?: string | null
          staff_id?: string
          target_key?: string
        }
        Relationships: []
      }
      tracking_policy_boosts: {
        Row: {
          consumed: boolean
          created_at: string
          expires_at: string
          id: string
          mode: string
          organization_id: string
          reason: string
          requested_by: string
          staff_id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          consumed?: boolean
          created_at?: string
          expires_at: string
          id?: string
          mode: string
          organization_id: string
          reason: string
          requested_by: string
          staff_id: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          consumed?: boolean
          created_at?: string
          expires_at?: string
          id?: string
          mode?: string
          organization_id?: string
          reason?: string
          requested_by?: string
          staff_id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
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
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
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
            foreignKeyName: "transport_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
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
          {
            foreignKeyName: "transport_email_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_time_edit_log: {
        Row: {
          created_at: string
          edited_by_id: string | null
          edited_by_name: string
          edited_by_type: string
          id: string
          new_values: Json
          organization_id: string
          previous_values: Json
          travel_log_id: string
        }
        Insert: {
          created_at?: string
          edited_by_id?: string | null
          edited_by_name: string
          edited_by_type?: string
          id?: string
          new_values?: Json
          organization_id: string
          previous_values?: Json
          travel_log_id: string
        }
        Update: {
          created_at?: string
          edited_by_id?: string | null
          edited_by_name?: string
          edited_by_type?: string
          id?: string
          new_values?: Json
          organization_id?: string
          previous_values?: Json
          travel_log_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_time_edit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_time_edit_log_travel_log_id_fkey"
            columns: ["travel_log_id"]
            isOneToOne: false
            referencedRelation: "travel_time_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_time_logs: {
        Row: {
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          auto_detected: boolean
          classification: string
          created_at: string
          description: string | null
          destination_booking_id: string | null
          end_time: string | null
          from_address: string | null
          from_latitude: number | null
          from_longitude: number | null
          hours_worked: number
          id: string
          manual_project_name: string | null
          needs_review: boolean
          next_target_id: string | null
          next_target_type: string | null
          organization_id: string
          previous_target_id: string | null
          previous_target_type: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_comment: string | null
          related_booking_id: string | null
          related_booking_note: string | null
          report_date: string
          source: string
          staff_id: string
          start_time: string
          to_address: string | null
          to_latitude: number | null
          to_longitude: number | null
          updated_at: string
        }
        Insert: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          auto_detected?: boolean
          classification?: string
          created_at?: string
          description?: string | null
          destination_booking_id?: string | null
          end_time?: string | null
          from_address?: string | null
          from_latitude?: number | null
          from_longitude?: number | null
          hours_worked?: number
          id?: string
          manual_project_name?: string | null
          needs_review?: boolean
          next_target_id?: string | null
          next_target_type?: string | null
          organization_id?: string
          previous_target_id?: string | null
          previous_target_type?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_comment?: string | null
          related_booking_id?: string | null
          related_booking_note?: string | null
          report_date?: string
          source?: string
          staff_id: string
          start_time?: string
          to_address?: string | null
          to_latitude?: number | null
          to_longitude?: number | null
          updated_at?: string
        }
        Update: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          auto_detected?: boolean
          classification?: string
          created_at?: string
          description?: string | null
          destination_booking_id?: string | null
          end_time?: string | null
          from_address?: string | null
          from_latitude?: number | null
          from_longitude?: number | null
          hours_worked?: number
          id?: string
          manual_project_name?: string | null
          needs_review?: boolean
          next_target_id?: string | null
          next_target_type?: string | null
          organization_id?: string
          previous_target_id?: string | null
          previous_target_type?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_comment?: string | null
          related_booking_id?: string | null
          related_booking_note?: string | null
          report_date?: string
          source?: string
          staff_id?: string
          start_time?: string
          to_address?: string | null
          to_latitude?: number | null
          to_longitude?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_time_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_time_logs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      unclear_segment_ai_analyses: {
        Row: {
          confidence: number
          created_at: string
          explanation: string
          id: string
          input_hash: string
          keep_as_type: string | null
          model: string
          needs_user_input: boolean
          organization_id: string
          segment_date: string
          segment_end_ts: string
          segment_id: string
          segment_kind: string
          segment_start_ts: string
          staff_id: string
          suggested_type: string
          tracking_policy_recommendation: Json | null
          updated_at: string
          user_question: string | null
        }
        Insert: {
          confidence: number
          created_at?: string
          explanation: string
          id?: string
          input_hash: string
          keep_as_type?: string | null
          model: string
          needs_user_input?: boolean
          organization_id: string
          segment_date: string
          segment_end_ts: string
          segment_id: string
          segment_kind: string
          segment_start_ts: string
          staff_id: string
          suggested_type: string
          tracking_policy_recommendation?: Json | null
          updated_at?: string
          user_question?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string
          explanation?: string
          id?: string
          input_hash?: string
          keep_as_type?: string | null
          model?: string
          needs_user_input?: boolean
          organization_id?: string
          segment_date?: string
          segment_end_ts?: string
          segment_id?: string
          segment_kind?: string
          segment_start_ts?: string
          staff_id?: string
          suggested_type?: string
          tracking_policy_recommendation?: Json | null
          updated_at?: string
          user_question?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_gps_history: {
        Row: {
          heading: number | null
          id: string
          lat: number
          lng: number
          organization_id: string
          recorded_at: string
          speed_kmh: number | null
          vehicle_id: string
        }
        Insert: {
          heading?: number | null
          id?: string
          lat: number
          lng: number
          organization_id?: string
          recorded_at?: string
          speed_kmh?: number | null
          vehicle_id: string
        }
        Update: {
          heading?: number | null
          id?: string
          lat?: number
          lng?: number
          organization_id?: string
          recorded_at?: string
          speed_kmh?: number | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_gps_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
          provided_vehicle_types?: string[] | null
          registration_number?: string | null
          updated_at?: string
          vehicle_height_m?: number | null
          vehicle_length_m?: number | null
          vehicle_type?: string | null
          vehicle_type_rates?: Json | null
          vehicle_width_m?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_assignments: {
        Row: {
          action: string
          assignment_date: string
          assignment_type: string
          booking_id: string | null
          booking_number: string | null
          created_at: string
          customer_name: string | null
          delivery_address: string | null
          description: string | null
          end_time: string | null
          id: string
          metadata: Json
          organization_id: string
          packing_id: string | null
          packlist_id: string | null
          project_task_id: string | null
          source: string | null
          staff_id: string
          start_time: string | null
          status: string
          title: string
          updated_at: string
          warehouse_event_id: string | null
        }
        Insert: {
          action: string
          assignment_date: string
          assignment_type: string
          booking_id?: string | null
          booking_number?: string | null
          created_at?: string
          customer_name?: string | null
          delivery_address?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          packing_id?: string | null
          packlist_id?: string | null
          project_task_id?: string | null
          source?: string | null
          staff_id: string
          start_time?: string | null
          status?: string
          title: string
          updated_at?: string
          warehouse_event_id?: string | null
        }
        Update: {
          action?: string
          assignment_date?: string
          assignment_type?: string
          booking_id?: string | null
          booking_number?: string | null
          created_at?: string
          customer_name?: string | null
          delivery_address?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          packing_id?: string | null
          packlist_id?: string | null
          project_task_id?: string | null
          source?: string | null
          staff_id?: string
          start_time?: string | null
          status?: string
          title?: string
          updated_at?: string
          warehouse_event_id?: string | null
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
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
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
          {
            foreignKeyName: "warehouse_calendar_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_project_changes: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          change_type: string
          created_at: string
          field_name: string | null
          id: string
          new_value: string | null
          old_value: string | null
          organization_id: string
          source_booking_id: string | null
          warehouse_project_id: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          change_type: string
          created_at?: string
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          organization_id: string
          source_booking_id?: string | null
          warehouse_project_id: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          change_type?: string
          created_at?: string
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          organization_id?: string
          source_booking_id?: string | null
          warehouse_project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_project_changes_warehouse_project_id_fkey"
            columns: ["warehouse_project_id"]
            isOneToOne: false
            referencedRelation: "warehouse_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_project_inbox: {
        Row: {
          client_name: string | null
          created_at: string
          event_date: string | null
          id: string
          organization_id: string
          processed_at: string | null
          source_id: string
          source_project_number: string | null
          source_type: string
          status: string
          warehouse_project_id: string | null
        }
        Insert: {
          client_name?: string | null
          created_at?: string
          event_date?: string | null
          id?: string
          organization_id: string
          processed_at?: string | null
          source_id: string
          source_project_number?: string | null
          source_type: string
          status?: string
          warehouse_project_id?: string | null
        }
        Update: {
          client_name?: string | null
          created_at?: string
          event_date?: string | null
          id?: string
          organization_id?: string
          processed_at?: string | null
          source_id?: string
          source_project_number?: string | null
          source_type?: string
          status?: string
          warehouse_project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_project_inbox_warehouse_project_id_fkey"
            columns: ["warehouse_project_id"]
            isOneToOne: false
            referencedRelation: "warehouse_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_project_tasks: {
        Row: {
          assigned_to: string | null
          category: string | null
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          organization_id: string
          sort_order: number
          start_date: string | null
          status: string
          title: string
          updated_at: string
          warehouse_project_id: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          organization_id: string
          sort_order?: number
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
          warehouse_project_id: string
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          organization_id?: string
          sort_order?: number
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
          warehouse_project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_project_tasks_warehouse_project_id_fkey"
            columns: ["warehouse_project_id"]
            isOneToOne: false
            referencedRelation: "warehouse_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_projects: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          is_internal: boolean
          manager_id: string | null
          name: string
          notes: string | null
          organization_id: string
          project_number: string
          source_large_project_id: string | null
          source_project_id: string | null
          source_project_number: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          is_internal?: boolean
          manager_id?: string | null
          name: string
          notes?: string | null
          organization_id: string
          project_number: string
          source_large_project_id?: string | null
          source_project_id?: string | null
          source_project_number?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          is_internal?: boolean
          manager_id?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          project_number?: string
          source_large_project_id?: string | null
          source_project_id?: string | null
          source_project_number?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_projects_source_large_project_id_fkey"
            columns: ["source_large_project_id"]
            isOneToOne: false
            referencedRelation: "large_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_staff_activations: {
        Row: {
          activation_type: string
          created_at: string
          end_date: string | null
          id: string
          is_active: boolean
          organization_id: string
          staff_id: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          activation_type: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          staff_id: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          activation_type?: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          staff_id?: string
          start_date?: string | null
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
          organization_id: string
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
          organization_id?: string
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
          organization_id?: string
          secret_key?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wms_reservation_allocations: {
        Row: {
          allocated_at: string
          created_at: string
          id: string
          instance_id: string | null
          item_type_id: string | null
          item_type_name: string | null
          organization_id: string
          packing_id: string
          raw: Json | null
          reservation_id: string
          serial_number: string
          sku: string | null
          source: string
          updated_at: string
        }
        Insert: {
          allocated_at?: string
          created_at?: string
          id?: string
          instance_id?: string | null
          item_type_id?: string | null
          item_type_name?: string | null
          organization_id: string
          packing_id: string
          raw?: Json | null
          reservation_id: string
          serial_number: string
          sku?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          allocated_at?: string
          created_at?: string
          id?: string
          instance_id?: string | null
          item_type_id?: string | null
          item_type_name?: string | null
          organization_id?: string
          packing_id?: string
          raw?: Json | null
          reservation_id?: string
          serial_number?: string
          sku?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      workday_flags: {
        Row: {
          assistant_decision_kind: string | null
          context: Json
          created_at: string
          description: string | null
          flag_date: string
          flag_type: string
          id: string
          needs_user_input: boolean
          organization_id: string
          related_anomaly_id: string | null
          related_booking_id: string | null
          related_large_project_id: string | null
          related_location_id: string | null
          related_time_report_id: string | null
          resolution_note: string | null
          resolution_source: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          staff_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assistant_decision_kind?: string | null
          context?: Json
          created_at?: string
          description?: string | null
          flag_date: string
          flag_type: string
          id?: string
          needs_user_input?: boolean
          organization_id: string
          related_anomaly_id?: string | null
          related_booking_id?: string | null
          related_large_project_id?: string | null
          related_location_id?: string | null
          related_time_report_id?: string | null
          resolution_note?: string | null
          resolution_source?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          staff_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assistant_decision_kind?: string | null
          context?: Json
          created_at?: string
          description?: string | null
          flag_date?: string
          flag_type?: string
          id?: string
          needs_user_input?: boolean
          organization_id?: string
          related_anomaly_id?: string | null
          related_booking_id?: string | null
          related_large_project_id?: string | null
          related_location_id?: string | null
          related_time_report_id?: string | null
          resolution_note?: string | null
          resolution_source?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          staff_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workday_flags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workday_flags_related_anomaly_id_fkey"
            columns: ["related_anomaly_id"]
            isOneToOne: false
            referencedRelation: "time_report_anomalies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workday_flags_related_large_project_id_fkey"
            columns: ["related_large_project_id"]
            isOneToOne: false
            referencedRelation: "large_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workday_flags_related_location_id_fkey"
            columns: ["related_location_id"]
            isOneToOne: false
            referencedRelation: "organization_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workday_flags_related_time_report_id_fkey"
            columns: ["related_time_report_id"]
            isOneToOne: false
            referencedRelation: "time_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      workdays: {
        Row: {
          admin_note: string | null
          approval_override_reason: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          ended_at: string | null
          ended_by: string | null
          id: string
          metadata: Json
          notes: string | null
          organization_id: string
          review_computed_at: string | null
          review_note: string | null
          review_reasons: string[]
          review_status: Database["public"]["Enums"]["workday_review_status"]
          staff_id: string
          started_at: string
          started_by: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          approval_override_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          organization_id: string
          review_computed_at?: string | null
          review_note?: string | null
          review_reasons?: string[]
          review_status?: Database["public"]["Enums"]["workday_review_status"]
          staff_id: string
          started_at?: string
          started_by?: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          approval_override_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          organization_id?: string
          review_computed_at?: string | null
          review_note?: string | null
          review_reasons?: string[]
          review_status?: Database["public"]["Enums"]["workday_review_status"]
          staff_id?: string
          started_at?: string
          started_by?: string
          updated_at?: string
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
      v_derived_period: {
        Row: {
          avg_closure_delay_days: number | null
          avg_complexity: number | null
          avg_days_to_invoice: number | null
          avg_products: number | null
          avg_project_hours: number | null
          avg_project_revenue: number | null
          avg_staff_count: number | null
          margin_pct: number | null
          month: string | null
          organization_id: string | null
          project_count: number | null
          projects_with_deviations: number | null
          projects_with_late_changes: number | null
          quarter: string | null
          total_cost: number | null
          total_hours: number | null
          total_margin: number | null
          total_revenue: number | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_completion_analytics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_derived_product: {
        Row: {
          avg_project_hours: number | null
          avg_project_margin_pct: number | null
          avg_project_revenue: number | null
          category: string | null
          deviation_pct: number | null
          in_profitable_projects: number | null
          in_unprofitable_projects: number | null
          late_addition_pct: number | null
          organization_id: string | null
          product_name: string | null
          project_count: number | null
          sku: string | null
          total_direct_cost: number | null
          total_quantity: number | null
          total_revenue: number | null
        }
        Relationships: []
      }
      v_derived_product_combinations: {
        Row: {
          avg_hours: number | null
          avg_hours_per_product: number | null
          avg_margin_pct: number | null
          avg_revenue: number | null
          category_a: string | null
          category_b: string | null
          co_occurrence_count: number | null
          organization_id: string | null
        }
        Relationships: []
      }
      v_derived_project: {
        Row: {
          approved_hours: number | null
          booking_id: string | null
          booking_number: string | null
          client_name: string | null
          closed_at: string | null
          closure_delay_days: number | null
          completed_at: string | null
          complexity_score: number | null
          customer_type: string | null
          days_to_invoice: number | null
          end_date: string | null
          event_date: string | null
          geographic_area: string | null
          had_deviations: boolean | null
          had_late_changes: boolean | null
          hours_per_product: number | null
          hours_per_revenue_sek: number | null
          id: string | null
          invoice_date: string | null
          margin_pct: number | null
          organization_id: string | null
          overtime_hours: number | null
          project_duration_days: number | null
          project_type: string | null
          revenue: number | null
          start_date: string | null
          tb: number | null
          total_cost: number | null
          total_deliveries: number | null
          total_hours: number | null
          total_parcels: number | null
          total_products: number | null
          total_staff_count: number | null
        }
        Insert: {
          approved_hours?: never
          booking_id?: string | null
          booking_number?: string | null
          client_name?: string | null
          closed_at?: string | null
          closure_delay_days?: never
          completed_at?: string | null
          complexity_score?: number | null
          customer_type?: string | null
          days_to_invoice?: never
          end_date?: string | null
          event_date?: string | null
          geographic_area?: string | null
          had_deviations?: boolean | null
          had_late_changes?: boolean | null
          hours_per_product?: never
          hours_per_revenue_sek?: never
          id?: string | null
          invoice_date?: string | null
          margin_pct?: never
          organization_id?: string | null
          overtime_hours?: never
          project_duration_days?: never
          project_type?: string | null
          revenue?: never
          start_date?: string | null
          tb?: never
          total_cost?: never
          total_deliveries?: number | null
          total_hours?: never
          total_parcels?: number | null
          total_products?: number | null
          total_staff_count?: number | null
        }
        Update: {
          approved_hours?: never
          booking_id?: string | null
          booking_number?: string | null
          client_name?: string | null
          closed_at?: string | null
          closure_delay_days?: never
          completed_at?: string | null
          complexity_score?: number | null
          customer_type?: string | null
          days_to_invoice?: never
          end_date?: string | null
          event_date?: string | null
          geographic_area?: string | null
          had_deviations?: boolean | null
          had_late_changes?: boolean | null
          hours_per_product?: never
          hours_per_revenue_sek?: never
          id?: string | null
          invoice_date?: string | null
          margin_pct?: never
          organization_id?: string | null
          overtime_hours?: never
          project_duration_days?: never
          project_type?: string | null
          revenue?: never
          start_date?: string | null
          tb?: never
          total_cost?: never
          total_deliveries?: number | null
          total_hours?: never
          total_parcels?: number | null
          total_products?: number | null
          total_staff_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_completion_analytics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_derived_staff: {
        Row: {
          avg_project_hours: number | null
          avg_project_margin_pct: number | null
          hours_by_project_type: Json | null
          organization_id: string | null
          project_count: number | null
          staff_id: string | null
          staff_name: string | null
          total_hours: number | null
          total_labor_cost: number | null
          total_overtime: number | null
        }
        Relationships: []
      }
      v_monthly_project_summary: {
        Row: {
          avg_complexity: number | null
          avg_margin_pct: number | null
          avg_staff_count: number | null
          month: string | null
          organization_id: string | null
          project_count: number | null
          projects_with_deviations: number | null
          projects_with_late_changes: number | null
          total_approved_hours: number | null
          total_cost: number | null
          total_hours: number | null
          total_margin: number | null
          total_overtime: number | null
          total_products: number | null
          total_revenue: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_completion_analytics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_product_category_monthly: {
        Row: {
          category: string | null
          caused_deviations: number | null
          late_additions: number | null
          month: string | null
          organization_id: string | null
          project_count: number | null
          total_cost: number | null
          total_quantity: number | null
          total_revenue: number | null
          total_setup_hours: number | null
        }
        Relationships: []
      }
      v_product_combinations: {
        Row: {
          avg_margin_when_combined: number | null
          category_a: string | null
          category_b: string | null
          co_occurrence_count: number | null
          organization_id: string | null
        }
        Relationships: []
      }
      v_product_project_matrix: {
        Row: {
          added_late: boolean | null
          booking_id: string | null
          category: string | null
          caused_deviation: boolean | null
          client_name: string | null
          completion_id: string | null
          complexity_score: number | null
          external_cost: number | null
          geographic_area: string | null
          is_package: boolean | null
          margin_percentage: number | null
          material_cost: number | null
          organization_id: string | null
          product_name: string | null
          project_date: string | null
          project_type: string | null
          quantity: number | null
          setup_hours: number | null
          sku: string | null
          total_hours_worked: number | null
          total_price: number | null
          total_staff_count: number | null
          unit_price: number | null
        }
        Relationships: []
      }
      v_staff_monthly_performance: {
        Row: {
          avg_project_margin: number | null
          month: string | null
          organization_id: string | null
          project_count: number | null
          staff_id: string | null
          staff_name: string | null
          total_hours: number | null
          total_labor_cost: number | null
          total_overtime: number | null
        }
        Relationships: []
      }
      v_staff_project_matrix: {
        Row: {
          approved: boolean | null
          booking_id: string | null
          client_name: string | null
          completion_id: string | null
          complexity_score: number | null
          geographic_area: string | null
          hourly_rate: number | null
          hours_worked: number | null
          labor_cost: number | null
          margin_percentage: number | null
          organization_id: string | null
          overtime_hours: number | null
          project_date: string | null
          project_type: string | null
          role: string | null
          staff_id: string | null
          staff_name: string | null
          total_products: number | null
          work_date: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      archive_dm_thread: {
        Args: { _my_ids: string[]; _org_id: string; _partner_id: string }
        Returns: number
      }
      archive_job_thread: {
        Args: { _booking_id: string; _my_ids: string[]; _org_id: string }
        Returns: number
      }
      auto_close_open_location_entries: { Args: never; Returns: number }
      claim_sync_jobs: {
        Args: { batch_limit?: number }
        Returns: {
          attempts: number
          booking_id: string
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          max_attempts: number
          organization_id: string
          processed_at: string | null
          received_at: string
          started_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "booking_sync_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_duplicate_calendar_events: {
        Args: never
        Returns: {
          booking_id_result: string
          duplicates_removed: number
          event_type_result: string
        }[]
      }
      cleanup_non_rep_lp_calendar_events: {
        Args: { _booking_id: string }
        Returns: number
      }
      cleanup_staff_location_history: {
        Args: never
        Returns: {
          approved_deleted: number
          orphans_deleted: number
        }[]
      }
      compute_workday_review_status: {
        Args: { p_workday_id: string }
        Returns: Database["public"]["Enums"]["workday_review_status"]
      }
      ensure_internal_lager_booking: {
        Args: { _org_id: string }
        Returns: string
      }
      ensure_internal_lager_setup: {
        Args: { _location_id?: string; _org_id: string }
        Returns: string
      }
      ensure_internal_project: { Args: { _org_id: string }; Returns: string }
      ensure_internal_warehouse_project: {
        Args: { _org_id: string }
        Returns: string
      }
      get_job_chat_summary: {
        Args: { _booking_ids: string[]; _my_ids: string[]; _org_id: string }
        Returns: {
          booking_id: string
          last_message_at: string
          last_message_content: string
          unread_count: number
        }[]
      }
      get_unseen_booking_updates: {
        Args: never
        Returns: {
          assigned_project_id: string
          booking_id: string
          change_count: number
          large_project_id: string
          last_change_at: string
        }[]
      }
      get_user_organization_id: { Args: { _user_id: string }; Returns: string }
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
      lp_rep_booking_id: { Args: { _lp: string }; Returns: string }
      mark_booking_changes_seen: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      mark_day_timeline_dirty: {
        Args: { _date: string; _org_id: string; _staff_id: string }
        Returns: undefined
      }
      mark_job_thread_read: {
        Args: { _booking_id: string; _my_ids: string[]; _org_id: string }
        Returns: number
      }
      promote_stale_assistant_events: { Args: never; Returns: number }
      recompute_booking_staff_for_day: {
        Args: { p_booking_id: string; p_date: string }
        Returns: Json
      }
      sync_all_phase_times: {
        Args: never
        Returns: {
          bookings_updated: number
          events_updated: number
          large_project_groups: number
          siblings_synced: number
        }[]
      }
      tr_shift_interval: {
        Args: { _date: string; _end: string; _start: string }
        Returns: unknown
      }
      trunc_to_second_immutable: { Args: { ts: string }; Returns: string }
      unarchive_dm_thread: {
        Args: { _my_ids: string[]; _org_id: string; _partner_id: string }
        Returns: number
      }
      unarchive_job_thread: {
        Args: { _booking_id: string; _my_ids: string[]; _org_id: string }
        Returns: number
      }
      upsert_task_calendar_event: {
        Args: { _task_id: string }
        Returns: string
      }
    }
    Enums: {
      anomaly_classification: "break" | "work"
      app_role: "admin" | "forsaljning" | "projekt" | "lager"
      assistant_event_resolution:
        | "pending"
        | "applied_from_event_time"
        | "applied_from_now"
        | "applied_from_custom_time"
        | "dismissed"
        | "merged_into_other_event"
        | "auto_closed_by_later_action"
        | "ignored_stale"
      assistant_event_source:
        | "geofence_foreground"
        | "geofence_background"
        | "app_manual"
        | "system_inferred"
        | "cron"
        | "geofence"
      assistant_event_suggested_action:
        | "start_workday"
        | "start_activity"
        | "end_activity"
        | "end_workday"
        | "register_travel"
        | "review_only"
        | "possible_arrival"
      assistant_event_target_type:
        | "location"
        | "project"
        | "booking"
        | "home"
        | "unknown"
      assistant_event_type:
        | "arrival"
        | "departure"
        | "home_arrival"
        | "travel_edge"
      availability_type: "available" | "unavailable" | "blocked"
      billing_status:
        | "draft"
        | "ready"
        | "invoiced"
        | "needs_completion"
        | "ready_for_handover"
        | "handed_over_to_booking"
        | "invoiced_in_booking"
      project_planning_status: "needs_planning" | "planned"
      workday_review_status:
        | "draft"
        | "needs_review"
        | "ready"
        | "approved"
        | "returned"
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
      anomaly_classification: ["break", "work"],
      app_role: ["admin", "forsaljning", "projekt", "lager"],
      assistant_event_resolution: [
        "pending",
        "applied_from_event_time",
        "applied_from_now",
        "applied_from_custom_time",
        "dismissed",
        "merged_into_other_event",
        "auto_closed_by_later_action",
        "ignored_stale",
      ],
      assistant_event_source: [
        "geofence_foreground",
        "geofence_background",
        "app_manual",
        "system_inferred",
        "cron",
        "geofence",
      ],
      assistant_event_suggested_action: [
        "start_workday",
        "start_activity",
        "end_activity",
        "end_workday",
        "register_travel",
        "review_only",
        "possible_arrival",
      ],
      assistant_event_target_type: [
        "location",
        "project",
        "booking",
        "home",
        "unknown",
      ],
      assistant_event_type: [
        "arrival",
        "departure",
        "home_arrival",
        "travel_edge",
      ],
      availability_type: ["available", "unavailable", "blocked"],
      billing_status: [
        "draft",
        "ready",
        "invoiced",
        "needs_completion",
        "ready_for_handover",
        "handed_over_to_booking",
        "invoiced_in_booking",
      ],
      project_planning_status: ["needs_planning", "planned"],
      workday_review_status: [
        "draft",
        "needs_review",
        "ready",
        "approved",
        "returned",
      ],
    },
  },
} as const
