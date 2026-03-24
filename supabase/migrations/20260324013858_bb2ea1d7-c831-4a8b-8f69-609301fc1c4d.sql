-- ══════════════════════════════════════════════════════════════════════════
-- Derived data views for analytics, reports and AI
-- ══════════════════════════════════════════════════════════════════════════

-- ─── PER PROJECT: derived KPIs ─────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_derived_project AS
SELECT
  j.id,
  j.organization_id,
  j.booking_id,
  j.booking_number,
  j.client_name,
  j.customer_type,
  j.project_type,
  j.geographic_area,
  j.event_date,
  j.start_date,
  j.end_date,
  j.completed_at,
  j.closed_at,
  j.invoice_date,
  j.complexity_score,
  j.had_deviations,
  j.had_late_changes,
  j.total_products,
  j.total_staff_count,
  j.total_parcels,
  j.total_deliveries,
  -- Revenue & cost
  COALESCE(j.total_revenue, 0) AS revenue,
  (COALESCE(j.total_labor_cost, 0)
   + COALESCE(j.total_material_cost, 0)
   + COALESCE(j.total_external_cost, 0)
   + COALESCE(j.total_purchases, 0)
   + COALESCE(j.warehouse_handling_cost, 0)) AS total_cost,
  -- TB (täckningsbidrag)
  COALESCE(j.total_margin, 0) AS tb,
  -- Marginal %
  CASE WHEN COALESCE(j.total_revenue, 0) > 0
    THEN ROUND((COALESCE(j.total_margin, 0) / j.total_revenue * 100)::numeric, 2)
    ELSE 0
  END AS margin_pct,
  -- Tid
  COALESCE(j.total_hours_worked, 0) AS total_hours,
  COALESCE(j.total_approved_hours, 0) AS approved_hours,
  COALESCE(j.total_overtime_hours, 0) AS overtime_hours,
  -- Tid per intäktskrona
  CASE WHEN COALESCE(j.total_revenue, 0) > 0
    THEN ROUND((COALESCE(j.total_hours_worked, 0) / j.total_revenue)::numeric, 6)
    ELSE NULL
  END AS hours_per_revenue_sek,
  -- Tid per produkt (estimerad)
  CASE WHEN COALESCE(j.total_products, 0) > 0
    THEN ROUND((COALESCE(j.total_hours_worked, 0)::numeric / j.total_products), 2)
    ELSE NULL
  END AS hours_per_product,
  -- Closure delay (dagar från event till stängning)
  CASE WHEN j.closed_at IS NOT NULL AND j.event_date IS NOT NULL
    THEN EXTRACT(DAY FROM (j.closed_at - j.event_date::timestamp))::integer
    ELSE NULL
  END AS closure_delay_days,
  -- Tid till faktura (dagar från event till fakturadatum)
  CASE WHEN j.invoice_date IS NOT NULL AND j.event_date IS NOT NULL
    THEN (j.invoice_date::date - j.event_date::date)
    ELSE NULL
  END AS days_to_invoice,
  -- Projektlängd (dagar)
  CASE WHEN j.start_date IS NOT NULL AND j.end_date IS NOT NULL
    THEN (j.end_date::date - j.start_date::date)
    ELSE NULL
  END AS project_duration_days
FROM public.job_completion_analytics j;

ALTER VIEW public.v_derived_project SET (security_invoker = on);


-- ─── PER PRODUCT: aggregated across all projects ──────────────────────────
CREATE OR REPLACE VIEW public.v_derived_product AS
SELECT
  cp.organization_id,
  cp.category,
  cp.product_name,
  cp.sku,
  -- Usage
  COUNT(DISTINCT cp.completion_id) AS project_count,
  SUM(cp.quantity) AS total_quantity,
  -- Revenue
  SUM(COALESCE(cp.total_price, 0)) AS total_revenue,
  -- Cost (direct product cost)
  SUM(COALESCE(cp.material_cost, 0) + COALESCE(cp.external_cost, 0)) AS total_direct_cost,
  -- Average project margin where this product appears
  ROUND(AVG(j.margin_percentage)::numeric, 2) AS avg_project_margin_pct,
  -- Average project hours where this product appears
  ROUND(AVG(j.total_hours_worked)::numeric, 2) AS avg_project_hours,
  -- Average project revenue
  ROUND(AVG(j.total_revenue)::numeric, 0) AS avg_project_revenue,
  -- Frequency in profitable (margin > 0) vs unprofitable projects
  SUM(CASE WHEN COALESCE(j.total_margin, 0) > 0 THEN 1 ELSE 0 END) AS in_profitable_projects,
  SUM(CASE WHEN COALESCE(j.total_margin, 0) <= 0 THEN 1 ELSE 0 END) AS in_unprofitable_projects,
  -- Late addition rate
  ROUND(AVG(CASE WHEN cp.added_late THEN 1.0 ELSE 0.0 END)::numeric * 100, 1) AS late_addition_pct,
  -- Deviation rate
  ROUND(AVG(CASE WHEN cp.caused_deviation THEN 1.0 ELSE 0.0 END)::numeric * 100, 1) AS deviation_pct
FROM public.completion_products cp
JOIN public.job_completion_analytics j ON j.id = cp.completion_id
GROUP BY cp.organization_id, cp.category, cp.product_name, cp.sku;

ALTER VIEW public.v_derived_product SET (security_invoker = on);


-- ─── PER PRODUCT COMBINATION: co-occurrence with derived KPIs ─────────────
CREATE OR REPLACE VIEW public.v_derived_product_combinations AS
SELECT
  a.organization_id,
  a.category AS category_a,
  b.category AS category_b,
  COUNT(DISTINCT a.completion_id) AS co_occurrence_count,
  ROUND(AVG(j.total_hours_worked)::numeric, 1) AS avg_hours,
  ROUND(AVG(j.margin_percentage)::numeric, 2) AS avg_margin_pct,
  ROUND(AVG(j.total_revenue)::numeric, 0) AS avg_revenue,
  ROUND(AVG(
    CASE WHEN COALESCE(j.total_products, 0) > 0
      THEN j.total_hours_worked::numeric / j.total_products
      ELSE NULL
    END
  )::numeric, 2) AS avg_hours_per_product
FROM public.completion_products a
JOIN public.completion_products b
  ON a.completion_id = b.completion_id AND a.category < b.category
JOIN public.job_completion_analytics j ON j.id = a.completion_id
WHERE a.category IS NOT NULL AND b.category IS NOT NULL
GROUP BY a.organization_id, a.category, b.category
HAVING COUNT(DISTINCT a.completion_id) >= 2;

ALTER VIEW public.v_derived_product_combinations SET (security_invoker = on);


-- ─── PER STAFF: aggregated performance ────────────────────────────────────
CREATE OR REPLACE VIEW public.v_derived_staff AS
SELECT
  cs.organization_id,
  cs.staff_id,
  cs.staff_name,
  -- Total
  COUNT(DISTINCT cs.completion_id) AS project_count,
  SUM(cs.hours_worked) AS total_hours,
  SUM(cs.overtime_hours) AS total_overtime,
  SUM(cs.hours_worked * cs.hourly_rate) AS total_labor_cost,
  -- Per project type
  jsonb_object_agg(
    COALESCE(j.project_type, 'unknown'),
    sub.hours_by_type
  ) FILTER (WHERE sub.hours_by_type IS NOT NULL) AS hours_by_project_type,
  -- Per product category (indirect — share of project hours)
  ROUND(AVG(j.margin_percentage)::numeric, 2) AS avg_project_margin_pct,
  ROUND(AVG(j.total_hours_worked)::numeric, 1) AS avg_project_hours
FROM public.completion_staff cs
JOIN public.job_completion_analytics j ON j.id = cs.completion_id
LEFT JOIN LATERAL (
  SELECT SUM(cs2.hours_worked) AS hours_by_type
  FROM public.completion_staff cs2
  WHERE cs2.staff_id = cs.staff_id
    AND cs2.completion_id IN (
      SELECT id FROM public.job_completion_analytics
      WHERE project_type = j.project_type
    )
) sub ON true
GROUP BY cs.organization_id, cs.staff_id, cs.staff_name;

ALTER VIEW public.v_derived_staff SET (security_invoker = on);


-- ─── PER PERIOD: quarterly + monthly roll-ups ─────────────────────────────
CREATE OR REPLACE VIEW public.v_derived_period AS
SELECT
  j.organization_id,
  date_trunc('month', COALESCE(j.event_date::timestamp, j.completed_at))::date AS month,
  date_trunc('quarter', COALESCE(j.event_date::timestamp, j.completed_at))::date AS quarter,
  EXTRACT(YEAR FROM COALESCE(j.event_date::timestamp, j.completed_at))::integer AS year,
  -- Counts
  COUNT(*) AS project_count,
  -- Revenue
  SUM(COALESCE(j.total_revenue, 0)) AS total_revenue,
  -- Cost
  SUM(
    COALESCE(j.total_labor_cost, 0)
    + COALESCE(j.total_material_cost, 0)
    + COALESCE(j.total_external_cost, 0)
    + COALESCE(j.total_purchases, 0)
    + COALESCE(j.warehouse_handling_cost, 0)
  ) AS total_cost,
  -- Margin
  SUM(COALESCE(j.total_margin, 0)) AS total_margin,
  ROUND(
    CASE WHEN SUM(COALESCE(j.total_revenue, 0)) > 0
      THEN (SUM(COALESCE(j.total_margin, 0)) / SUM(j.total_revenue) * 100)::numeric
      ELSE 0
    END, 2
  ) AS margin_pct,
  -- Averages
  ROUND(AVG(COALESCE(j.total_revenue, 0))::numeric, 0) AS avg_project_revenue,
  ROUND(AVG(COALESCE(j.total_hours_worked, 0))::numeric, 1) AS avg_project_hours,
  ROUND(AVG(COALESCE(j.total_staff_count, 0))::numeric, 1) AS avg_staff_count,
  ROUND(AVG(COALESCE(j.total_products, 0))::numeric, 1) AS avg_products,
  -- Time
  SUM(COALESCE(j.total_hours_worked, 0)) AS total_hours,
  -- Quality
  SUM(CASE WHEN j.had_deviations THEN 1 ELSE 0 END) AS projects_with_deviations,
  SUM(CASE WHEN j.had_late_changes THEN 1 ELSE 0 END) AS projects_with_late_changes,
  ROUND(AVG(COALESCE(j.complexity_score, 0))::numeric, 1) AS avg_complexity,
  -- Closure performance
  ROUND(AVG(
    CASE WHEN j.closed_at IS NOT NULL AND j.event_date IS NOT NULL
      THEN EXTRACT(DAY FROM (j.closed_at - j.event_date::timestamp))
      ELSE NULL
    END
  )::numeric, 1) AS avg_closure_delay_days,
  ROUND(AVG(
    CASE WHEN j.invoice_date IS NOT NULL AND j.event_date IS NOT NULL
      THEN (j.invoice_date::date - j.event_date::date)
      ELSE NULL
    END
  )::numeric, 1) AS avg_days_to_invoice
FROM public.job_completion_analytics j
GROUP BY
  j.organization_id,
  date_trunc('month', COALESCE(j.event_date::timestamp, j.completed_at)),
  date_trunc('quarter', COALESCE(j.event_date::timestamp, j.completed_at)),
  EXTRACT(YEAR FROM COALESCE(j.event_date::timestamp, j.completed_at));

ALTER VIEW public.v_derived_period SET (security_invoker = on);