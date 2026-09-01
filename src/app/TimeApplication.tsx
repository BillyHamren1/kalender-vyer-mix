import TimeAppShell from '@/shells/TimeAppShell';
import { MobileRuntime } from './MobileRuntime';

const TimeApplication = () => (
  <MobileRuntime>
    <TimeAppShell />
  </MobileRuntime>
);

export default TimeApplication;
