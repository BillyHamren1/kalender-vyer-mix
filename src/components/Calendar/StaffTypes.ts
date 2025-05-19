
// Interface for a staff member
export interface StaffMember {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  assignedTeam?: string | null;
}

// Interface for a staff assignment
export interface StaffAssignment {
  id: string;
  staff_id: string;
  team_id: string;
  assignment_date: string;
  staff_members?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
}
