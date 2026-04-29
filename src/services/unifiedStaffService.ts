import { supabase } from "@/integrations/supabase/client";

export interface StaffMember {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

export interface StaffAssignment {
  id: string;
  staff_id: string;
  team_id: string;
  assignment_date: string;
  staff_members?: StaffMember;
}

export interface StaffCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  resourceId: string;
  teamId?: string;
  bookingId?: string;
  eventType: 'assignment' | 'booking_event';
  backgroundColor?: string;
  borderColor?: string;
  client?: string;
  extendedProps?: any;
}

export interface StaffOperationResponse {
  success: boolean;
  data?: any;
  error?: string;
  conflicts?: any[];
  affected_staff?: string[];
}

export interface StaffExportOptions {
  headers?: Record<string, string>;
  format?: 'json' | 'csv';
}

class UnifiedStaffService {
  private async callStaffFunction(operation: string, data: any = {}, options: any = {}): Promise<StaffOperationResponse> {
    try {
      const { data: response, error } = await supabase.functions.invoke('staff-management', {
        body: { operation, data, options }
      });

      if (error) {
        console.error(`Staff service error for ${operation}:`, error);
        throw error;
      }

      return response;
    } catch (error) {
      console.error(`Error calling staff function ${operation}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Staff CRUD Operations
  async getStaffMembers(): Promise<StaffMember[]> {
    const result = await this.callStaffFunction('get_staff_members');
    return result.success ? result.data : [];
  }

  async syncStaffMember(staffData: any): Promise<void> {
    const result = await this.callStaffFunction('sync_staff_member', staffData);
    if (!result.success) {
      throw new Error(result.error || 'Failed to sync staff member');
    }
  }

  async createStaffMember(name: string, email?: string, phone?: string): Promise<StaffMember> {
    const result = await this.callStaffFunction('create_staff_member', { name, email, phone });
    if (!result.success) {
      throw new Error(result.error || 'Failed to create staff member');
    }
    return result.data;
  }

  // Assignment Operations
  async getStaffAssignments(date: Date, teamId?: string): Promise<StaffAssignment[]> {
    const dateStr = date.toISOString().split('T')[0];
    const result = await this.callStaffFunction('get_staff_assignments', { date: dateStr, team_id: teamId });
    return result.success ? result.data : [];
  }

  // Canonical write path — delegates to staffAssignmentCore so there is only
  // ONE writer to public.staff_assignments. The legacy edge-function actions
  // 'assign_staff_to_team' / 'remove_staff_assignment' are no longer used.
  async assignStaffToTeam(staffId: string, teamId: string, date: Date): Promise<void> {
    const { assignStaffToTeamCore } = await import('./staffAssignmentCore');
    await assignStaffToTeamCore(staffId, teamId, date);
  }

  async removeStaffAssignment(staffId: string, date: Date, teamId?: string): Promise<void> {
    const { removeStaffAssignmentCore } = await import('./staffAssignmentCore');
    await removeStaffAssignmentCore(staffId, date, teamId);
  }

  async getAvailableStaff(date: Date): Promise<StaffMember[]> {
    const dateStr = date.toISOString().split('T')[0];
    const result = await this.callStaffFunction('get_available_staff', { date: dateStr });
    return result.success ? result.data : [];
  }

  // Calendar Operations
  async getStaffCalendarEvents(staffIds: string[], startDate: Date, endDate: Date): Promise<StaffCalendarEvent[]> {
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const result = await this.callStaffFunction('get_staff_calendar_events', {
      staff_ids: staffIds,
      start_date: startDateStr,
      end_date: endDateStr
    });
    
    return result.success ? result.data : [];
  }

  // Booking Assignment Operations
  async assignStaffToBooking(bookingId: string, staffId: string, teamId: string, date: Date): Promise<void> {
    const dateStr = date.toISOString().split('T')[0];
    const result = await this.callStaffFunction('assign_staff_to_booking', {
      booking_id: bookingId,
      staff_id: staffId,
      team_id: teamId,
      date: dateStr
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to assign staff to booking');
    }
  }

  async removeStaffFromBooking(bookingId: string, staffId: string, date: Date): Promise<void> {
    const dateStr = date.toISOString().split('T')[0];
    const result = await this.callStaffFunction('remove_staff_from_booking', {
      booking_id: bookingId,
      staff_id: staffId,
      date: dateStr
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to remove staff from booking');
    }
  }

  // DEPRECATED: handleBookingMove removed — BSA derives from staff_assignments
  // × calendar_events via recompute_booking_staff_for_day RPC.
  // See mem://features/planning/calendar-team-model-v1


  // Bulk Operations
  async bulkAssignStaff(assignments: Array<{ staff_id: string; team_id: string; date: string }>): Promise<StaffOperationResponse> {
    return await this.callStaffFunction('bulk_assign_staff', { assignments });
  }

  // Summary Operations
  async getStaffSummary(staffIds: string[], date: Date): Promise<Array<{ staffId: string; teamId?: string; bookingsCount: number }>> {
    const dateStr = date.toISOString().split('T')[0];
    const result = await this.callStaffFunction('get_staff_summary', {
      staff_ids: staffIds,
      date: dateStr
    });
    
    return result.success ? result.data : [];
  }

  // New Export Operations
  async exportStaffToExternal(externalUrl: string, staffIds?: string[], options: StaffExportOptions = {}): Promise<StaffOperationResponse> {
    return await this.callStaffFunction('export_staff_to_external', {
      external_url: externalUrl,
      staff_ids: staffIds
    }, options);
  }

  async exportAllStaff(externalUrl: string, options: StaffExportOptions = {}): Promise<StaffOperationResponse> {
    return await this.callStaffFunction('export_staff_to_external', {
      external_url: externalUrl,
      staff_ids: undefined // Export all staff
    }, options);
  }

  async exportSelectedStaff(externalUrl: string, staffIds: string[], options: StaffExportOptions = {}): Promise<StaffOperationResponse> {
    if (!staffIds || staffIds.length === 0) {
      return {
        success: false,
        error: 'No staff members selected for export'
      };
    }
    
    return await this.callStaffFunction('export_staff_to_external', {
      external_url: externalUrl,
      staff_ids: staffIds
    }, options);
  }
}

// Export singleton instance
export const unifiedStaffService = new UnifiedStaffService();

// Export individual functions for backward compatibility
export const {
  getStaffMembers,
  syncStaffMember,
  createStaffMember,
  getStaffAssignments,
  assignStaffToTeam,
  removeStaffAssignment,
  getAvailableStaff,
  getStaffCalendarEvents,
  assignStaffToBooking,
  removeStaffFromBooking,
  
  bulkAssignStaff,
  getStaffSummary,
  exportStaffToExternal,
  exportAllStaff,
  exportSelectedStaff
} = unifiedStaffService;
