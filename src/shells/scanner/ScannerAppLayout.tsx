import React from 'react';

interface ScannerAppLayoutProps {
  children: React.ReactNode;
}

/**
 * ScannerAppLayout — the native shell for EventFlow Scanner.
 * Minimal chrome, full-screen scanner-first experience.
 * No bottom navigation — the scanner app uses its own inline nav.
 */
const ScannerAppLayout: React.FC<ScannerAppLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
};

export default ScannerAppLayout;
