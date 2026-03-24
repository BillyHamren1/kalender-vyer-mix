import { useMemo } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, ShieldCheck, Truck, Users, ListChecks, Clock, DollarSign } from "lucide-react";
import type { ProjectTask } from "@/types/project";
import type { MergedSupplier } from "@/types/supplier";

type ReadinessLevel = 'ready' | 'attention' | 'at_risk' | 'completed';

interface StatusBlock {
  label: string;
  icon: React.ElementType;
  level: ReadinessLevel;
  detail: string;
}

interface ProjectStatusPanelProps {
  tasks: ProjectTask[];
  suppliers: ProjectSupplier[];
  transportAssignments: any[];
  projectStatus: string;
}

const LEVEL_CONFIG: Record<ReadinessLevel, { bg: string; border: string; text: string; icon: string }> = {
  ready: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-700 dark:text-emerald-400',
    icon: 'text-emerald-500',
  },
  attention: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-700 dark:text-amber-400',
    icon: 'text-amber-500',
  },
  at_risk: {
    bg: 'bg-destructive/10',
    border: 'border-destructive/30',
    text: 'text-destructive',
    icon: 'text-destructive',
  },
  completed: {
    bg: 'bg-muted/50',
    border: 'border-border/50',
    text: 'text-muted-foreground',
    icon: 'text-muted-foreground',
  },
};

const OVERALL_LABELS: Record<ReadinessLevel, { label: string; icon: React.ElementType }> = {
  at_risk: { label: 'At Risk', icon: AlertCircle },
  attention: { label: 'Needs Attention', icon: AlertTriangle },
  ready: { label: 'Ready', icon: ShieldCheck },
  completed: { label: 'Completed', icon: CheckCircle2 },
};

const ProjectStatusPanel = ({ tasks, suppliers, transportAssignments, projectStatus }: ProjectStatusPanelProps) => {
  const blocks = useMemo<StatusBlock[]>(() => {
    const now = new Date();

    // 1. Suppliers
    const activeSuppliers = suppliers.filter(s => s.status !== 'cancelled');
    const confirmedSuppliers = activeSuppliers.filter(s => s.status === 'confirmed');
    const supplierBlock: StatusBlock = activeSuppliers.length === 0
      ? { label: 'Leverantörer', icon: Users, level: 'ready', detail: 'Inga UE behövs' }
      : confirmedSuppliers.length === activeSuppliers.length
        ? { label: 'Leverantörer', icon: Users, level: 'ready', detail: `${confirmedSuppliers.length} bekräftade` }
        : confirmedSuppliers.length > 0
          ? { label: 'Leverantörer', icon: Users, level: 'attention', detail: `${confirmedSuppliers.length}/${activeSuppliers.length} bekräftade` }
          : { label: 'Leverantörer', icon: Users, level: 'at_risk', detail: `0/${activeSuppliers.length} bekräftade` };

    // 2. Transport
    const transportBlock: StatusBlock = transportAssignments.length > 0
      ? { label: 'Transport', icon: Truck, level: 'ready', detail: `${transportAssignments.length} bokade` }
      : { label: 'Transport', icon: Truck, level: 'attention', detail: 'Ej bokad' };

    // 3. Tasks
    const actionTasks = tasks.filter(t => !t.is_info_only);
    const completedTasks = actionTasks.filter(t => t.completed);
    const taskBlock: StatusBlock = actionTasks.length === 0
      ? { label: 'Uppgifter', icon: ListChecks, level: 'ready', detail: 'Inga uppgifter' }
      : completedTasks.length === actionTasks.length
        ? { label: 'Uppgifter', icon: ListChecks, level: 'ready', detail: 'Alla klara' }
        : completedTasks.length >= actionTasks.length * 0.5
          ? { label: 'Uppgifter', icon: ListChecks, level: 'attention', detail: `${completedTasks.length}/${actionTasks.length} klara` }
          : { label: 'Uppgifter', icon: ListChecks, level: 'at_risk', detail: `${completedTasks.length}/${actionTasks.length} klara` };

    // 4. Timeline
    const timelineTasks = tasks.filter(t => t.end_date && !t.completed);
    const overdueTasks = timelineTasks.filter(t => new Date(t.end_date!) < now);
    const timelineBlock: StatusBlock = overdueTasks.length > 0
      ? { label: 'Tidslinje', icon: Clock, level: 'at_risk', detail: `${overdueTasks.length} försenade` }
      : timelineTasks.length > 0
        ? { label: 'Tidslinje', icon: Clock, level: 'ready', detail: 'I tid' }
        : { label: 'Tidslinje', icon: Clock, level: 'ready', detail: 'Inga deadlines' };

    // 5. Economy (placeholder — based on supplier pricing data)
    const suppliersWithPrice = activeSuppliers.filter(s => s.confirmed_price != null || s.quoted_price != null);
    const economyBlock: StatusBlock = activeSuppliers.length === 0
      ? { label: 'Ekonomi', icon: DollarSign, level: 'ready', detail: 'Inga kostnader' }
      : suppliersWithPrice.length === activeSuppliers.length
        ? { label: 'Ekonomi', icon: DollarSign, level: 'ready', detail: 'Priser angivna' }
        : { label: 'Ekonomi', icon: DollarSign, level: 'attention', detail: `${activeSuppliers.length - suppliersWithPrice.length} saknar pris` };

    return [supplierBlock, transportBlock, taskBlock, timelineBlock, economyBlock];
  }, [tasks, suppliers, transportAssignments]);

  // Overall status
  const overallLevel = useMemo<ReadinessLevel>(() => {
    if (projectStatus === 'completed') return 'completed';
    const hasRisk = blocks.some(b => b.level === 'at_risk');
    if (hasRisk) return 'at_risk';
    const hasAttention = blocks.some(b => b.level === 'attention');
    if (hasAttention) return 'attention';
    return 'ready';
  }, [blocks, projectStatus]);

  const overall = OVERALL_LABELS[overallLevel];
  const overallCfg = LEVEL_CONFIG[overallLevel];

  return (
    <div className={`rounded-xl border ${overallCfg.border} ${overallCfg.bg} p-4`}>
      <div className="flex items-center gap-3 mb-3">
        <overall.icon className={`h-5 w-5 ${overallCfg.icon}`} />
        <h3 className={`text-sm font-bold uppercase tracking-wider ${overallCfg.text}`}>
          {overall.label}
        </h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {blocks.map((block) => {
          const cfg = LEVEL_CONFIG[overallLevel === 'completed' ? 'completed' : block.level];
          return (
            <div
              key={block.label}
              className={`flex items-center gap-2.5 rounded-lg border ${cfg.border} bg-card/60 px-3 py-2.5`}
            >
              <block.icon className={`h-4 w-4 shrink-0 ${cfg.icon}`} />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground truncate">{block.label}</p>
                <p className={`text-xs font-semibold truncate ${cfg.text}`}>{block.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProjectStatusPanel;
