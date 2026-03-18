

## Problem

The weather widget fetches wind speed from Open-Meteo API **without specifying the unit**. Open-Meteo defaults to **km/h**, but the widget displays the raw numbers next to a wind icon — making them look like m/s values. This gives nonsensical wind speeds (e.g. "28 m/s" = orkan, when the actual value is 28 km/h ≈ 7.8 m/s).

## Fix

Add `&wind_speed_unit=ms` to the Open-Meteo API URL in `LogisticsWeeklyWeatherWidget.tsx` (line 97). This makes the API return wind speeds in m/s directly — no conversion needed.

Same fix needed in `LogisticsWeatherWidget.tsx` (the single-day widget) which has the same issue.

### Files changed
- `src/components/logistics/widgets/LogisticsWeeklyWeatherWidget.tsx` — add `&wind_speed_unit=ms` to fetch URL
- `src/components/logistics/widgets/LogisticsWeatherWidget.tsx` — add `&wind_speed_unit=ms` to fetch URL

