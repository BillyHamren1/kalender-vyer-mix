import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface ListItem {
  id: string;
  primaryText: string;
  secondaryText?: string;
  status?: string;
  statusVariant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  onClick?: () => void;
}

interface DashboardListWidgetProps {
  title: string;
  icon: React.ReactNode;
  items: ListItem[];
  isLoading: boolean;
  emptyText?: string;
  maxVisible?: number;
  onItemClick?: (item: ListItem) => void;
}

const getStatusStyles = (variant?: 'default' | 'success' | 'warning' | 'danger' | 'info') => {
  switch (variant) {
    case 'success':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'warning':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'danger':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'info':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    default:
      return 'bg-primary/10 text-primary border-primary/20';
  }
};

const DashboardListWidget = ({
  title,
  icon,
  items,
  isLoading,
  emptyText = "Inga objekt",
  maxVisible = 5,
  onItemClick
}: DashboardListWidgetProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const visibleItems = isExpanded ? items : items.slice(0, maxVisible);
  const hiddenCount = items.length - maxVisible;
  const hasMore = items.length > maxVisible;

  if (isLoading) {
    return (
      <Card className="h-full bg-card shadow-lg border border-border/60">
        <CardHeader className="pb-3 border-b border-border/40">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            {icon}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full bg-card shadow-lg border border-border/60">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            {icon}
            {title}
          </CardTitle>
          {hasMore && !isExpanded && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setIsExpanded(true)}
            >
              +{hiddenCount} till
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          )}
          {hasMore && isExpanded && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setIsExpanded(false)}
            >
              Visa mindre
              <ChevronUp className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">{emptyText}</p>
        ) : (
          <div className="space-y-1">
            {visibleItems.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  if (item.onClick) item.onClick();
                  else if (onItemClick) onItemClick(item);
                }}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/50 last:border-b-0 gap-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground break-words">
                    {item.primaryText}
                  </p>
                  {item.secondaryText && (
                    <p className="text-xs text-muted-foreground">
                      {item.secondaryText}
                    </p>
                  )}
                </div>
                {item.status && (
                  <Badge 
                    variant="outline"
                    className={`ml-2 flex-shrink-0 text-xs ${getStatusStyles(item.statusVariant)}`}
                  >
                    {item.status}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DashboardListWidget;
