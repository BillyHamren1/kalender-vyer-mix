import { Mountain, Ruler, TriangleRight, ArrowUpDown, Maximize2 } from "lucide-react";

interface TerrainProfileVisualProps {
  minHeight: number | null;
  maxHeight: number | null;
  heightRange: number | null;
  surfaceArea: number | null;
  averageSlope: number | null;
}

/**
 * Visual terrain profile with ruler indicators showing height range,
 * surface dimensions and slope — giving an intuitive sense of the scanned area.
 */
const TerrainProfileVisual = ({
  minHeight,
  maxHeight,
  heightRange,
  surfaceArea,
  averageSlope,
}: TerrainProfileVisualProps) => {
  // Derive a side length estimate from surface area (assuming roughly square)
  const sideLengthEstimate = surfaceArea != null && surfaceArea > 0
    ? Math.sqrt(surfaceArea)
    : null;

  // Normalize height range for visual bar (clamp to reasonable range)
  const maxVisualHeight = 10; // 10m = full bar
  const heightFraction = heightRange != null
    ? Math.min(heightRange / maxVisualHeight, 1)
    : 0;

  const minH = minHeight ?? 0;
  const maxH = maxHeight ?? 0;
  const slopeAngle = averageSlope ?? 0;

  return (
    <div className="space-y-4">
      {/* Visual profile */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-stretch gap-6" style={{ minHeight: 180 }}>
          {/* Height ruler (left side) */}
          {heightRange != null && (
            <div className="flex flex-col items-center justify-between py-1 shrink-0 w-16">
              {/* Max height label */}
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Max</p>
                <p className="text-sm font-bold font-heading text-primary">
                  {maxH.toFixed(2)}
                  <span className="text-[10px] font-normal text-muted-foreground ml-0.5">m</span>
                </p>
              </div>

              {/* Vertical ruler bar */}
              <div className="flex-1 flex items-center my-2 relative">
                <div className="w-px bg-border h-full" />
                {/* Height ticks */}
                <div className="absolute left-0 top-0 w-2 h-px bg-primary" />
                <div className="absolute left-0 bottom-0 w-2 h-px bg-primary" />
                {/* Height range label */}
                <div className="absolute -right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <ArrowUpDown className="h-3 w-3 text-primary" />
                  <span className="text-xs font-bold font-heading text-primary whitespace-nowrap">
                    {heightRange.toFixed(2)} m
                  </span>
                </div>
              </div>

              {/* Min height label */}
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Min</p>
                <p className="text-sm font-bold font-heading text-primary">
                  {minH.toFixed(2)}
                  <span className="text-[10px] font-normal text-muted-foreground ml-0.5">m</span>
                </p>
              </div>
            </div>
          )}

          {/* Terrain cross-section visualization */}
          <div className="flex-1 flex flex-col justify-end relative">
            {/* SVG terrain profile */}
            <svg
              viewBox="0 0 200 100"
              className="w-full"
              style={{ maxHeight: 140 }}
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="terrain-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="terrain-stroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
                  <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              {[20, 40, 60, 80].map((y) => (
                <line
                  key={y}
                  x1="0" y1={y} x2="200" y2={y}
                  stroke="hsl(var(--border))"
                  strokeWidth="0.5"
                  strokeDasharray="4 4"
                />
              ))}

              {/* Terrain shape — uses slope + height to create a realistic profile */}
              <path
                d={generateTerrainPath(heightFraction, slopeAngle)}
                fill="url(#terrain-fill)"
                stroke="url(#terrain-stroke)"
                strokeWidth="1.5"
              />

              {/* Base line */}
              <line
                x1="0" y1="98" x2="200" y2="98"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth="0.5"
                opacity="0.3"
              />
            </svg>

            {/* Horizontal dimension ruler */}
            {sideLengthEstimate != null && (
              <div className="flex items-center gap-2 mt-2 px-1">
                <div className="flex-1 flex items-center">
                  <div className="h-px flex-1 bg-primary/40" />
                  <div className="h-2 w-px bg-primary/40" />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Maximize2 className="h-3 w-3 text-primary" />
                  <span className="text-xs font-bold font-heading text-primary">
                    ~{sideLengthEstimate.toFixed(1)} × {sideLengthEstimate.toFixed(1)} m
                  </span>
                </div>
                <div className="flex-1 flex items-center">
                  <div className="h-2 w-px bg-primary/40" />
                  <div className="h-px flex-1 bg-primary/40" />
                </div>
              </div>
            )}
          </div>

          {/* Slope indicator (right side) */}
          {averageSlope != null && (
            <div className="flex flex-col items-center justify-center shrink-0 w-16 gap-2">
              <div className="relative h-14 w-14 rounded-full border-2 border-border bg-card flex items-center justify-center">
                {/* Slope angle indicator needle */}
                <div
                  className="absolute h-5 w-0.5 bg-primary rounded-full origin-bottom"
                  style={{
                    transform: `rotate(${Math.min(slopeAngle, 45)}deg)`,
                    bottom: "50%",
                    left: "calc(50% - 1px)",
                  }}
                />
                <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold font-heading text-primary">
                  {averageSlope.toFixed(1)}°
                </p>
                <p className="text-[10px] text-muted-foreground">Lutning</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Metric summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricTile label="Min höjd" value={minHeight} unit="m" icon={Mountain} />
        <MetricTile label="Max höjd" value={maxHeight} unit="m" icon={Mountain} />
        <MetricTile label="Höjdskillnad" value={heightRange} unit="m" icon={ArrowUpDown} />
        <MetricTile label="Medellutning" value={averageSlope} unit="°" icon={TriangleRight} />
        <MetricTile label="Yta" value={surfaceArea} unit="m²" icon={Ruler} />
      </div>
    </div>
  );
};

/** Generate a terrain silhouette path based on height fraction and slope */
function generateTerrainPath(heightFraction: number, slopeAngle: number): string {
  const baseY = 98;
  const peakHeight = Math.max(heightFraction * 70, 8); // min 8px height
  const slopeBias = Math.min(slopeAngle / 45, 1); // 0 = flat, 1 = steep

  // Create a natural-looking terrain profile
  // Slope bias shifts the peak to one side
  const peakX = 100 + slopeBias * 40;
  const y1 = baseY;
  const yPeak = baseY - peakHeight;

  // Control points for a smooth bezier curve
  return [
    `M 0 ${y1}`,
    `C 20 ${y1}, ${peakX - 70} ${yPeak + peakHeight * 0.6}, ${peakX - 40} ${yPeak + peakHeight * 0.2}`,
    `S ${peakX - 10} ${yPeak}, ${peakX} ${yPeak}`,
    `S ${peakX + 30} ${yPeak + peakHeight * 0.15}, ${peakX + 50} ${yPeak + peakHeight * 0.4}`,
    `C ${peakX + 70} ${yPeak + peakHeight * 0.7}, 190 ${y1 - 5}, 200 ${y1}`,
    `L 200 ${baseY}`,
    `L 0 ${baseY}`,
    `Z`,
  ].join(" ");
}

function MetricTile({
  label,
  value,
  unit,
  icon: Icon,
}: {
  label: string;
  value: number | null;
  unit: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-2.5">
      <div className="h-8 w-8 rounded-lg bg-primary/8 border border-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{label}</p>
        <p className="text-sm font-bold font-heading leading-none mt-0.5">
          {value != null ? `${value.toFixed(2)} ${unit}` : "—"}
        </p>
      </div>
    </div>
  );
}

export default TerrainProfileVisual;
