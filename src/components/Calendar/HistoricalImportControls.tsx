
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar, Database, AlertTriangle } from 'lucide-react';
import { useBackgroundImport } from '@/hooks/useBackgroundImport';
import { toast } from 'sonner';

interface HistoricalImportControlsProps {
  onImportComplete?: () => void;
}

const HistoricalImportControls: React.FC<HistoricalImportControlsProps> = ({
  onImportComplete
}) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [includeAllHistory, setIncludeAllHistory] = useState(false);
  
  const { isHistoricalImporting, performHistoricalImport } = useBackgroundImport({
    onImportComplete: onImportComplete
  });

  const handleHistoricalImport = async () => {
    try {
      if (!includeAllHistory && (!startDate || !endDate)) {
        toast.error('Please specify date range or select "Import All Historical Data"');
        return;
      }

      if (!includeAllHistory && startDate && endDate && new Date(startDate) > new Date(endDate)) {
        toast.error('Start date must be before end date');
        return;
      }

      const result = await performHistoricalImport(
        includeAllHistory ? undefined : startDate,
        includeAllHistory ? undefined : endDate
      );

      if (result.success) {
        const eventsCreated = result.results?.calendar_events_created || 0;
        const newBookings = result.results?.new_bookings?.length || 0;
        const updatedBookings = result.results?.updated_bookings?.length || 0;
        
        toast.success('Historical import completed', {
          description: `${newBookings} new, ${updatedBookings} updated bookings • ${eventsCreated} calendar events created`
        });
        
        // Reset form
        setStartDate('');
        setEndDate('');
        setIncludeAllHistory(false);
        
        if (onImportComplete) {
          onImportComplete();
        }
      } else {
        toast.error(`Historical import failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Error during historical import:', error);
      toast.error('Failed to start historical import');
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Historical Data Import
        </CardTitle>
        <CardDescription>
          Import bookings from any date range, including historical data that may not appear in regular syncs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="include-all"
            checked={includeAllHistory}
            onCheckedChange={(checked) => setIncludeAllHistory(checked as boolean)}
          />
          <Label htmlFor="include-all" className="text-sm font-medium">
            Import all historical data (regardless of date)
          </Label>
        </div>

        {!includeAllHistory && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={includeAllHistory}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={includeAllHistory}
              />
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Important Notes:</p>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>Historical imports may take longer to complete</li>
              <li>Only CONFIRMED bookings will create calendar events</li>
              <li>This will process all bookings in the selected range</li>
              <li>Duplicate events will be automatically prevented</li>
            </ul>
          </div>
        </div>

        <Button
          onClick={handleHistoricalImport}
          disabled={isHistoricalImporting}
          className="w-full"
          size="lg"
        >
          {isHistoricalImporting ? (
            <>
              <Calendar className="h-4 w-4 mr-2 animate-spin" />
              Importing Historical Data...
            </>
          ) : (
            <>
              <Database className="h-4 w-4 mr-2" />
              Start Historical Import
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

export default HistoricalImportControls;
