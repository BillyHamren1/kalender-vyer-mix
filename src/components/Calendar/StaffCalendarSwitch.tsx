import React from 'react';
import IndividualStaffCalendar from './IndividualStaffCalendar';
import CustomMonthGrid from './custom/CustomMonthGrid';

type StaffCalendarSwitchProps = React.ComponentProps<typeof IndividualStaffCalendar>;

const StaffCalendarSwitch: React.FC<StaffCalendarSwitchProps> = (props) => {
  const useCustom = typeof window !== 'undefined' && localStorage.getItem('use_custom_calendar') === 'true';

  return useCustom
    ? <CustomMonthGrid {...props} />
    : <IndividualStaffCalendar {...props} />;
};

export default StaffCalendarSwitch;
