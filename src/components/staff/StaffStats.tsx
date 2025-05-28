
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, UserCheck, Calendar, MapPin } from 'lucide-react';
import { StaffMember } from '@/services/staffService';

interface StaffStatsProps {
  staffMembers: StaffMember[];
  isLoading: boolean;
}

const StaffStats: React.FC<StaffStatsProps> = ({ staffMembers, isLoading }) => {
  const totalStaff = staffMembers.length;
  const staffWithEmail = staffMembers.filter(staff => staff.email).length;
  const staffWithPhone = staffMembers.filter(staff => staff.phone).length;
  const assignedStaff = staffMembers.filter(staff => staff.assignedTeam).length;

  const stats = [
    {
      title: 'Total Staff',
      value: totalStaff,
      icon: Users,
      color: 'text-[#82b6c6]',
    },
    {
      title: 'With Email',
      value: staffWithEmail,
      icon: UserCheck,
      color: 'text-green-600',
    },
    {
      title: 'With Phone',
      value: staffWithPhone,
      icon: Calendar,
      color: 'text-blue-600',
    },
    {
      title: 'Assigned',
      value: assignedStaff,
      icon: MapPin,
      color: 'text-purple-600',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-20"></div>
                  <div className="h-6 bg-gray-200 rounded w-12"></div>
                </div>
                <div className="h-8 w-8 bg-gray-200 rounded"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
              <stat.icon className={`h-8 w-8 ${stat.color}`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default StaffStats;
