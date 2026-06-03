/**
 * StaffTimeAvatar — initial-baserad avatar för admin Tid & Lön-vyn.
 * Ren UI-helper, ingen datalogik.
 */
import { cn } from "@/lib/utils";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

// Stabil hash → en av N premiumtoner. Samma namn ger samma färg över sessioner.
const PALETTE = [
  "from-violet-500 to-violet-700",
  "from-sky-500 to-sky-700",
  "from-emerald-500 to-emerald-700",
  "from-amber-500 to-amber-700",
  "from-rose-500 to-rose-700",
  "from-teal-500 to-teal-700",
  "from-indigo-500 to-indigo-700",
  "from-fuchsia-500 to-fuchsia-700",
] as const;

function paletteFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length]!;
}

interface Props {
  name: string;
  size?: "sm" | "md";
  className?: string;
}

export default function StaffTimeAvatar({ name, size = "sm", className }: Props) {
  const initials = initialsOf(name);
  const grad = paletteFor(name);
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full text-white font-semibold shadow-sm shrink-0 bg-gradient-to-br",
        grad,
        size === "sm" ? "h-7 w-7 text-[10.5px]" : "h-9 w-9 text-xs",
        className,
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}
