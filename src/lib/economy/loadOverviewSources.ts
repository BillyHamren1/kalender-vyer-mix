/** Start independent owner reads together; never replace failed dates with invented values. */
export async function loadOverviewSources<TDates, TEconomy>(
  loadDates: () => Promise<TDates>,
  loadEconomy: () => Promise<TEconomy>,
): Promise<[TDates, TEconomy]> {
  return Promise.all([loadDates(), loadEconomy()]);
}