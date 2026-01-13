import React, { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { GripVertical, Trash2, AlertTriangle, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export interface ChecklistItemData {
  id: string;
  title: string;
  deadline: Date | null;
  isAsap: boolean;
  isInfoOnly: boolean;
  sort_order: number;
}

interface ChecklistItemProps {
  item: ChecklistItemData;
  index: number;
  moveItem: (dragIndex: number, hoverIndex: number) => void;
  onDeadlineChange: (id: string, date: Date | null) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

interface DragItem {
  index: number;
  id: string;
  type: string;
}

const ItemType = 'CHECKLIST_ITEM';

export function ChecklistItem({ 
  item, 
  index, 
  moveItem, 
  onDeadlineChange, 
  onRemove,
  disabled = false 
}: ChecklistItemProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ handlerId }, drop] = useDrop<DragItem, void, { handlerId: string | symbol | null }>({
    accept: ItemType,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(dragItem: DragItem, monitor) {
      if (!ref.current || item.isInfoOnly) {
        return;
      }
      const dragIndex = dragItem.index;
      const hoverIndex = index;

      if (dragIndex === hoverIndex) {
        return;
      }

      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      const hoverClientY = clientOffset!.y - hoverBoundingRect.top;

      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }

      moveItem(dragIndex, hoverIndex);
      dragItem.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag, preview] = useDrag({
    type: ItemType,
    item: () => ({ id: item.id, index }),
    canDrag: !item.isInfoOnly && !disabled,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  drag(drop(ref));

  if (item.isInfoOnly) {
    return (
      <div className="flex items-center gap-3 py-3 px-4 bg-muted/50 rounded-lg border border-border/50">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 text-muted-foreground">{item.title}</span>
        <span className="text-sm text-muted-foreground">
          {item.deadline ? format(item.deadline, 'd MMM yyyy', { locale: sv }) : '-'}
        </span>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">info</span>
      </div>
    );
  }

  return (
    <div
      ref={preview}
      className={cn(
        "flex items-center gap-3 py-3 px-4 bg-background rounded-lg border",
        isDragging ? "opacity-50 border-primary" : "border-border",
        "transition-all duration-150"
      )}
      data-handler-id={handlerId}
    >
      <div 
        ref={ref}
        className={cn(
          "cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      
      <span className="flex-1 font-medium">{item.title}</span>
      
      {item.isAsap && (
        <span title="ASAP - deadline har justerats">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        </span>
      )}
      
      <Popover>
        <PopoverTrigger asChild>
          <Button 
            variant="outline" 
            size="sm"
            className={cn(
              "w-[140px] justify-start text-left font-normal",
              !item.deadline && "text-muted-foreground"
            )}
          >
            <Calendar className="mr-2 h-4 w-4" />
            {item.deadline ? format(item.deadline, 'd MMM yyyy', { locale: sv }) : 'Välj datum'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <CalendarComponent
            mode="single"
            selected={item.deadline || undefined}
            onSelect={(date) => onDeadlineChange(item.id, date || null)}
            initialFocus
            locale={sv}
          />
        </PopoverContent>
      </Popover>
      
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onRemove(item.id)}
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
