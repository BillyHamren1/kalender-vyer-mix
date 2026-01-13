import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Wallet, Plus, Trash2 } from 'lucide-react';
import { ProjectLaborCost } from '@/types/projectStaff';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

interface LaborCostsSectionProps {
  costs: ProjectLaborCost[];
  isLoading: boolean;
  onAddCost: () => void;
  onDeleteCost: (id: string) => void;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

export const LaborCostsSection = ({
  costs,
  isLoading,
  onAddCost,
  onDeleteCost
}: LaborCostsSectionProps) => {
  const totalHours = costs.reduce((sum, c) => sum + c.hours, 0);
  const totalCost = costs.reduce((sum, c) => sum + (c.hours * c.hourly_rate), 0);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" />
            Manuella arbetskostnader
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Laddar...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4" />
          Manuella arbetskostnader
        </CardTitle>
        <Button size="sm" onClick={onAddCost}>
          <Plus className="h-4 w-4 mr-1" />
          Lägg till
        </Button>
      </CardHeader>
      <CardContent>
        {costs.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            Inga manuella arbetskostnader tillagda.
            <br />
            <Button variant="link" onClick={onAddCost} className="mt-2">
              Klicka här för att lägga till
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Personal/Beskrivning</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead className="text-right">Timmar</TableHead>
                  <TableHead className="text-right">Tim-lön</TableHead>
                  <TableHead className="text-right">Kostnad</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costs.map((cost) => (
                  <TableRow key={cost.id}>
                    <TableCell>
                      <div className="font-medium">{cost.staff_name}</div>
                      {cost.description && (
                        <div className="text-sm text-muted-foreground">{cost.description}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {cost.work_date
                        ? format(new Date(cost.work_date), 'd MMM yyyy', { locale: sv })
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">{cost.hours} h</TableCell>
                    <TableCell className="text-right">{formatCurrency(cost.hourly_rate)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(cost.hours * cost.hourly_rate)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteCost(cost.id)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/50">
                  <TableCell colSpan={2}>TOTALT</TableCell>
                  <TableCell className="text-right">{totalHours} h</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right">{formatCurrency(totalCost)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
