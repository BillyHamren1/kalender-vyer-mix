import ScannerAppShell from '@/shells/ScannerAppShell';
import { MobileRuntime } from './MobileRuntime';

const ScannerApplication = () => (
  <MobileRuntime>
    <ScannerAppShell />
  </MobileRuntime>
);

export default ScannerApplication;
