import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PackingStatus, PACKING_STATUS_LABELS } from "@/types/packing";

interface PackingStatusDropdownProps {
  status: PackingStatus;
  onStatusChange: (status: PackingStatus) => void;
}

const PackingStatusDropdown = ({ status, onStatusChange }: PackingStatusDropdownProps) => {
  return (
    <Select value={status} onValueChange={(v) => onStatusChange(v as PackingStatus)}>
      <SelectTrigger className="w-[180px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(PACKING_STATUS_LABELS).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default PackingStatusDropdown;
