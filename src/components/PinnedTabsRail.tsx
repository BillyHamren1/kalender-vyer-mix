import { NavLink, useLocation } from "react-router-dom";
import { X, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePinnedTabs } from "@/contexts/PinnedTabsContext";

/**
 * Vertikal lista med sparade tabbar längs högerkanten.
 * Tabbarna är persistenta (localStorage) och navigerar tillbaka till sparad sida.
 */
export function PinnedTabsRail() {
  const { tabs, removeTab } = usePinnedTabs();
  const location = useLocation();

  if (tabs.length === 0) return null;

  return (
    <aside
      className="hidden lg:flex shrink-0 flex-col items-stretch gap-2 py-3 px-2 overflow-y-auto"
      style={{
        width: 56,
        background: "hsl(0 0% 99.5%)",
        borderLeft: "1px solid hsl(240 8% 88%)",
        boxShadow: "-1px 0 0 hsl(240 8% 94%), -2px 0 8px hsl(240 10% 20% / 0.04)",
      }}
      aria-label="Sparade tabbar"
    >
      <div
        className="flex items-center justify-center pb-1 text-[9px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "hsl(240 6% 50%)" }}
        title="Sparade tabbar"
      >
        <Pin className="w-3 h-3" strokeWidth={2} />
      </div>

      {tabs.map((tab) => {
        const active =
          location.pathname === tab.path ||
          location.pathname.startsWith(tab.path + "/");
        return (
          <div key={tab.path} className="relative group">
            <NavLink
              to={tab.path}
              title={tab.title + (tab.subtitle ? ` · ${tab.subtitle}` : "")}
              className={cn(
                "relative flex flex-col items-center justify-center rounded-lg px-1 py-3 transition-all duration-150 select-none",
                "border"
              )}
              style={
                active
                  ? {
                      background: "hsl(270 55% 96%)",
                      borderColor: "hsl(270 40% 85%)",
                      color: "hsl(280 50% 28%)",
                    }
                  : {
                      background: "hsl(0 0% 100%)",
                      borderColor: "hsl(240 8% 90%)",
                      color: "hsl(240 8% 30%)",
                    }
              }
            >
              <span
                className="text-[11px] font-semibold leading-tight truncate max-h-[150px]"
                style={{
                  writingMode: "vertical-rl",
                  transform: "rotate(180deg)",
                }}
              >
                {tab.title}
              </span>
              {tab.subtitle && (
                <span
                  className="mt-1 text-[10px] font-medium leading-tight truncate max-h-[90px]"
                  style={{
                    writingMode: "vertical-rl",
                    transform: "rotate(180deg)",
                    color: "hsl(240 6% 55%)",
                  }}
                >
                  {tab.subtitle}
                </span>
              )}
            </NavLink>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                removeTab(tab.path);
              }}
              className={cn(
                "absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center",
                "opacity-0 group-hover:opacity-100 transition-opacity",
                "bg-foreground text-background shadow"
              )}
              title="Ta bort tabb"
              aria-label={`Ta bort ${tab.title}`}
            >
              <X className="w-2.5 h-2.5" strokeWidth={2.5} />
            </button>
          </div>
        );
      })}
    </aside>
  );
}
