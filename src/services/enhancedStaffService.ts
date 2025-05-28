
import { unifiedStaffService } from './unifiedStaffService';
import { format } from 'date-fns';

export interface StaffBookingValidation {
  staffId: string;
  staffName: string;
  teamId: string;
  date: string;
  hasValidAssignment: boolean;
  bookingCount: number;
  issues: string[];
}

export interface ConnectionHealth {
  overallHealth: 'good' | 'warning' | 'error';
  validatedAt: string;
  totalStaff: number;
  staffWithIssues: number;
  validations: StaffBookingValidation[];
}

class EnhancedStaffService {
  private static instance: EnhancedStaffService;
  
  static getInstance(): EnhancedStaffService {
    if (!EnhancedStaffService.instance) {
      EnhancedStaffService.instance = new EnhancedStaffService();
    }
    return EnhancedStaffService.instance;
  }

  // Validate staff-booking connections comprehensively
  async validateStaffBookingConnections(date: Date): Promise<ConnectionHealth> {
    const dateStr = format(date, 'yyyy-MM-dd');
    console.log(`🔍 Enhanced validation for ${dateStr}`);
    
    try {
      // Get all staff assignments for the date
      const staffAssignments = await unifiedStaffService.getStaffAssignments(date);
      console.log(`📋 Found ${staffAssignments.length} staff assignments`);
      
      if (staffAssignments.length === 0) {
        return {
          overallHealth: 'warning',
          validatedAt: new Date().toISOString(),
          totalStaff: 0,
          staffWithIssues: 0,
          validations: []
        };
      }
      
      // Get staff IDs and fetch summary
      const staffIds = staffAssignments.map(a => a.staff_id);
      const staffSummary = await unifiedStaffService.getStaffSummary(staffIds, date);
      console.log(`📊 Staff summary:`, staffSummary);
      
      // Validate each staff member
      const validations: StaffBookingValidation[] = [];
      let staffWithIssues = 0;
      
      for (const assignment of staffAssignments) {
        const summary = staffSummary.find(s => s.staffId === assignment.staff_id);
        const issues: string[] = [];
        
        // Check if staff has booking assignments
        if (!summary || summary.bookingsCount === 0) {
          issues.push('No booking assignments found');
        }
        
        // Check for team assignment consistency
        if (summary && summary.teamId !== assignment.team_id) {
          issues.push(`Team mismatch: assigned to ${assignment.team_id} but summary shows ${summary.teamId}`);
        }
        
        const validation: StaffBookingValidation = {
          staffId: assignment.staff_id,
          staffName: assignment.staff_members?.name || `Staff ${assignment.staff_id}`,
          teamId: assignment.team_id,
          date: dateStr,
          hasValidAssignment: issues.length === 0,
          bookingCount: summary?.bookingsCount || 0,
          issues
        };
        
        validations.push(validation);
        
        if (issues.length > 0) {
          staffWithIssues++;
          console.warn(`⚠️ Issues found for ${validation.staffName}:`, issues);
        } else {
          console.log(`✅ ${validation.staffName} validation passed`);
        }
      }
      
      // Determine overall health
      let overallHealth: 'good' | 'warning' | 'error' = 'good';
      if (staffWithIssues > 0) {
        overallHealth = staffWithIssues === validations.length ? 'error' : 'warning';
      }
      
      const result: ConnectionHealth = {
        overallHealth,
        validatedAt: new Date().toISOString(),
        totalStaff: validations.length,
        staffWithIssues,
        validations
      };
      
      console.log(`🎯 Validation complete:`, result);
      return result;
      
    } catch (error) {
      console.error('❌ Enhanced validation failed:', error);
      return {
        overallHealth: 'error',
        validatedAt: new Date().toISOString(),
        totalStaff: 0,
        staffWithIssues: 0,
        validations: []
      };
    }
  }

  // Enhanced staff assignment with pre/post validation
  async assignStaffWithValidation(
    staffId: string, 
    teamId: string, 
    date: Date
  ): Promise<{ success: boolean; issues?: string[] }> {
    const dateStr = format(date, 'yyyy-MM-dd');
    console.log(`🔄 Enhanced assignment: ${staffId} → ${teamId} for ${dateStr}`);
    
    try {
      // Pre-assignment validation
      const preValidation = await this.validateStaffBookingConnections(date);
      console.log('📋 Pre-assignment health:', preValidation.overallHealth);
      
      // Perform the assignment
      await unifiedStaffService.assignStaffToTeam(staffId, teamId, date);
      console.log('✅ Core assignment completed');
      
      // Post-assignment validation (with delay for auto-assignments)
      await new Promise(resolve => setTimeout(resolve, 1500));
      const postValidation = await this.validateStaffBookingConnections(date);
      console.log('📋 Post-assignment health:', postValidation.overallHealth);
      
      // Check if the specific staff member now has valid connections
      const staffValidation = postValidation.validations.find(v => v.staffId === staffId);
      
      if (!staffValidation) {
        return {
          success: false,
          issues: ['Staff assignment not found after operation']
        };
      }
      
      if (staffValidation.issues.length > 0) {
        return {
          success: true, // Assignment succeeded but with issues
          issues: staffValidation.issues
        };
      }
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ Enhanced assignment failed:', error);
      return {
        success: false,
        issues: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  // Enhanced staff removal with validation
  async removeStaffWithValidation(
    staffId: string, 
    date: Date
  ): Promise<{ success: boolean; issues?: string[] }> {
    const dateStr = format(date, 'yyyy-MM-dd');
    console.log(`🗑️ Enhanced removal: ${staffId} for ${dateStr}`);
    
    try {
      // Perform the removal
      await unifiedStaffService.removeStaffAssignment(staffId, date);
      console.log('✅ Core removal completed');
      
      // Post-removal validation
      await new Promise(resolve => setTimeout(resolve, 1000));
      const postValidation = await this.validateStaffBookingConnections(date);
      console.log('📋 Post-removal health:', postValidation.overallHealth);
      
      // Verify the staff member is no longer assigned
      const staffValidation = postValidation.validations.find(v => v.staffId === staffId);
      
      if (staffValidation) {
        return {
          success: false,
          issues: ['Staff assignment still exists after removal']
        };
      }
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ Enhanced removal failed:', error);
      return {
        success: false,
        issues: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  // Get detailed connection report
  async getConnectionReport(date: Date): Promise<{
    summary: string;
    details: ConnectionHealth;
    recommendations: string[];
  }> {
    const health = await this.validateStaffBookingConnections(date);
    const dateStr = format(date, 'yyyy-MM-dd');
    
    let summary = '';
    const recommendations: string[] = [];
    
    switch (health.overallHealth) {
      case 'good':
        summary = `All ${health.totalStaff} staff members have valid booking connections for ${dateStr}`;
        break;
      case 'warning':
        summary = `${health.staffWithIssues}/${health.totalStaff} staff members have issues for ${dateStr}`;
        recommendations.push('Review staff assignments with issues');
        break;
      case 'error':
        summary = `Critical issues found for all staff assignments on ${dateStr}`;
        recommendations.push('Check staff assignment system');
        recommendations.push('Verify booking assignments are being created');
        break;
    }
    
    // Add specific recommendations based on issues
    for (const validation of health.validations) {
      if (validation.issues.includes('No booking assignments found')) {
        recommendations.push(`Assign ${validation.staffName} to bookings or verify team has work`);
      }
    }
    
    return {
      summary,
      details: health,
      recommendations: [...new Set(recommendations)] // Remove duplicates
    };
  }
}

// Export singleton instance
export const enhancedStaffService = EnhancedStaffService.getInstance();
