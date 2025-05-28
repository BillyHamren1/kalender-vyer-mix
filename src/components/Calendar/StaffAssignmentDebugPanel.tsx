
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useStaffAssignmentDebugger, AssignmentDebugLog } from '@/hooks/useStaffAssignmentDebugger';
import { format } from 'date-fns';
import { Bug, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

interface StaffAssignmentDebugPanelProps {
  currentDate: Date;
}

const StaffAssignmentDebugPanel: React.FC<StaffAssignmentDebugPanelProps> = ({ currentDate }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { 
    debugLogs, 
    verifyAssignmentInDatabase, 
    getAllAssignmentsForDate 
  } = useStaffAssignmentDebugger();

  const handleVerifyAllAssignments = async () => {
    const result = await getAllAssignmentsForDate(currentDate);
    if (result.success) {
      console.log('📋 All assignments for date:', result.assignments);
    }
  };

  const getLogTypeColor = (operation: string, success: boolean) => {
    if (!success) return 'bg-red-100 text-red-800 border-red-300';
    
    switch (operation) {
      case 'create_assignment_direct':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'remove_assignment_direct':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'verify_assignment':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'realtime_change':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const formatLogEntry = (log: AssignmentDebugLog) => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    return `${time} - ${log.operation} - Staff: ${log.staffId}${log.teamId ? ` → ${log.teamId}` : ''} - ${log.success ? 'SUCCESS' : 'FAILED'}`;
  };

  return (
    <Card className="w-full border-blue-200">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bug className="h-4 w-4" />
            Staff Assignment Debug
            <Badge variant="outline" className="text-xs">
              {format(currentDate, 'MMM d')}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleVerifyAllAssignments}
              title="Verify all assignments in database"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {debugLogs.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-2">
                No debug logs yet
              </div>
            ) : (
              debugLogs.slice().reverse().map((log, index) => (
                <div 
                  key={index} 
                  className={`text-xs p-2 rounded border ${getLogTypeColor(log.operation, log.success)}`}
                >
                  <div className="font-mono">{formatLogEntry(log)}</div>
                  {log.error && (
                    <div className="text-red-600 mt-1 font-mono">
                      Error: {log.error}
                    </div>
                  )}
                  {log.dbResult && (
                    <div className="text-gray-600 mt-1 font-mono text-xs">
                      Result: {JSON.stringify(log.dbResult, null, 2)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default StaffAssignmentDebugPanel;
