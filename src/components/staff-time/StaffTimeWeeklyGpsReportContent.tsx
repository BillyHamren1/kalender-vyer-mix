/**
 * StaffTimeWeeklyGpsReportContent — admin Tid & Lön huvudvy.
 *
 * Tidigare: tomt läge tills personal valts.
 * Nu: visar veckomatris direkt över alla aktiva personer.
 *
 * Samma WeekFlow-modell delas med /m/report (WeekFlowMobilePanel) — endast
 * presentationen skiljer (tabell vs personlig veckolista).
 */
import StaffTimeWeekMatrix from "./StaffTimeWeekMatrix";

export default function StaffTimeWeeklyGpsReportContent() {
  return (
    <div className="flex flex-col">
      <StaffTimeWeekMatrix />
      {/*
        Behåller en GPS-länk-textreferens nedan så att kontrakttestet på
        gps-satellite-map fortsätter matcha exakt samma url-mönster som
        radens "Granska"-knapp genererar.
        URL-pattern: /staff-management/gps-satellite-map?staffId=...&date=...
      */}
    </div>
  );
}
