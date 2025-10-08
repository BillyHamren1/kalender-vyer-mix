
import React from 'react';

interface ChangeHighlightProps {
  changeType: string | null;
  children: React.ReactNode;
  className?: string;
}

const ChangeHighlight: React.FC<ChangeHighlightProps> = ({ changeType, children, className = "" }) => {
  const getHighlightClass = (type: string | null): string => {
    if (!type) return "";
    
    switch (type) {
      case 'status_change':
        return 'bg-amber-50 border-l-4 border-amber-400';
      case 'update':
        return 'bg-blue-50 border-l-4 border-blue-400';
      case 'new':
        return 'bg-green-50 border-l-4 border-green-400';
      default:
        return 'bg-gray-50 border-l-4 border-gray-400';
    }
  };

  const highlightClass = getHighlightClass(changeType);
  
  return (
    <div className={`${highlightClass} ${className} transition-all duration-200`}>
      {children}
    </div>
  );
};

export default ChangeHighlight;
