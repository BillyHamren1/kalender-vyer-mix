import React from 'react';
import ResourceCalendar from './ResourceCalendar';
import CustomResourceTimeGrid from './custom/CustomResourceTimeGrid';

// Re-export the props type from ResourceCalendar for consumers
type ResourceCalendarSwitchProps = React.ComponentProps<typeof ResourceCalendar>;

const ResourceCalendarSwitch: React.FC<ResourceCalendarSwitchProps> = (props) => {
  const useCustom = typeof window !== 'undefined' && localStorage.getItem('use_custom_calendar') === 'true';

  return useCustom
    ? <CustomResourceTimeGrid {...props} />
    : <ResourceCalendar {...props} />;
};

export default ResourceCalendarSwitch;
