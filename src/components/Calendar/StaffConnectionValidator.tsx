
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useStaffBookingConnection } from '@/hooks/useStaffBookingConnection';
import { format } from 'date-fns';
import { CheckCircle, AlertCircle, XCircle, RefreshCw } from 'lucide-react';

interface StaffConnectionValidatorProps {
  currentDate: Date;
  onValidationComplete?: (isValid: boolean) => void;
}

const StaffConnectionValidator: React.FC<StaffConnectionValidatorProps> = ({
  currentDate,
  onValidationComplete
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const { 
    isValidating, 
    lastValidation, 
    validateConnections 
  } = useStaffBookingConnection();

  // Auto-validate on mount and date change
  useEffect(() => {
    validateConnections(currentDate);
  }, [currentDate, validateConnections]);

  // Notify parent of validation results
  useEffect(() => {
    if (lastValidation && onValidationComplete) {
      onValidationComplete(lastValidation.isValid);
    }
  }, [lastValidation, onValidationComplete]);

  const handleValidate = () => {
    validateConnections(currentDate);
  };

  const getStatusIcon = () => {
    if (isValidating) {
      return <RefreshCw className="h-4 w-4 animate-spin" />;
    }
    
    if (!lastValidation) {
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
    
    if (lastValidation.isValid && lastValidation.warnings.length === 0) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    
    if (lastValidation.isValid && lastValidation.warnings.length > 0) {
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
    
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  const getStatusText = () => {
    if (isValidating) return "Validating...";
    if (!lastValidation) return "Not validated";
    
    if (lastValidation.isValid && lastValidation.warnings.length === 0) {
      return "All connections valid";
    }
    
    if (lastValidation.isValid && lastValidation.warnings.length > 0) {
      return `Valid with ${lastValidation.warnings.length} warnings`;
    }
    
    return `${lastValidation.errors.length} errors found`;
  };

  const getStatusColor = () => {
    if (isValidating) return "bg-blue-50 border-blue-200";
    if (!lastValidation) return "bg-gray-50 border-gray-200";
    
    if (lastValidation.isValid && lastValidation.warnings.length === 0) {
      return "bg-green-50 border-green-200";
    }
    
    if (lastValidation.isValid && lastValidation.warnings.length > 0) {
      return "bg-yellow-50 border-yellow-200";
    }
    
    return "bg-red-50 border-red-200";
  };

  return (
    <Card className={`w-full ${getStatusColor()}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {getStatusIcon()}
            Staff-Booking Connections
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {format(currentDate, 'MMM d')}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleValidate}
              disabled={isValidating}
            >
              <RefreshCw className={`h-3 w-3 ${isValidating ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">{getStatusText()}</span>
          {lastValidation && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs"
            >
              {showDetails ? 'Hide' : 'Show'} Details
            </Button>
          )}
        </div>
        
        {showDetails && lastValidation && (
          <div className="mt-3 space-y-2">
            <div className="text-xs text-gray-600">
              <strong>Staff Assignments:</strong> {lastValidation.staffAssignments.length}
            </div>
            
            {lastValidation.errors.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-red-600">Errors:</div>
                {lastValidation.errors.map((error, index) => (
                  <div key={index} className="text-xs text-red-600 pl-2">
                    • {error}
                  </div>
                ))}
              </div>
            )}
            
            {lastValidation.warnings.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-yellow-600">Warnings:</div>
                {lastValidation.warnings.map((warning, index) => (
                  <div key={index} className="text-xs text-yellow-600 pl-2">
                    • {warning}
                  </div>
                ))}
              </div>
            )}
            
            {lastValidation.staffAssignments.map((assignment, index) => (
              <div key={index} className="text-xs bg-white p-2 rounded border">
                <strong>{assignment.staff_members?.name || assignment.staff_id}</strong> → Team {assignment.team_id}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default StaffConnectionValidator;
