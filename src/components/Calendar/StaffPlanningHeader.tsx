
import React from 'react';
import { CalendarDays } from 'lucide-react';

const StaffPlanningHeader: React.FC = () => {
  return (
    <div className="flex items-center gap-3 mb-1">
      <div className="w-12 h-12 bg-[#82b6c6] rounded-full flex items-center justify-center">
        <CalendarDays className="h-6 w-6 text-white" />
      </div>
      <h1 className="text-3xl font-bold text-slate-800">Staff Planning</h1>
    </div>
  );
};

export default StaffPlanningHeader;
