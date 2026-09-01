import scannerConfig from './capacitor.scanner.config';
import timeConfig from './capacitor.time.config';

const mode = process.env.CAPACITOR_APP_MODE ?? 'time';

if (mode !== 'time' && mode !== 'scanner') {
  throw new Error(`Unsupported CAPACITOR_APP_MODE: ${mode}`);
}

// The CLI reads one stable dispatcher. Build scripts select a mode through the
// environment and never rewrite this file or another app's native project.
export default mode === 'scanner' ? scannerConfig : timeConfig;
