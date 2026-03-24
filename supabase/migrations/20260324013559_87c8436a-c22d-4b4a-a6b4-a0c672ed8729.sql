-- ══════════════════════════════════════════════════════════════════════════
-- Analysis views: Layer 3 — Analyzable structure over raw data
-- ══════════════════════════════════════════════════════════════════════════

-- 1. Monthly project summary (time-series ready)
CREATE OR REPLACE VIEW public.v_monthly_project_summary AS
SELECT
  organization_id,
  date_trunc('month', COALESCE(event_date::timestamp, completed_at))::date AS month,
  COUNT(*) AS project_count,
  SUM(COALESCE(total_revenue, 0)) AS total_revenue,
  SUM(COALESCE(total_labor_cost, 0) + COALESCE(total_material_cost, 0) + COALESCE(total_external_cost, 0) + COALESCE(total_purchases, 0) + COALESCE(warehouse_handling_cost, 0)) AS total_cost,
  SUM(COALESCE(total_margin, 0)) AS total_margin,
  AVG(COALESCE(margin_percentage, 0))::numeric(10,2) AS avg_margin_pct,
  SUM(COALESCE(total_hours_worked, 0)) AS total_hours,
  SUM(COALESCE(total_approved_hours, 0)) AS total_approved_hours,
  SUM(COALESCE(total_overtime_hours, 0)) AS total_overtime,
  AVG(COALESCE(total_staff_count, 0))::numeric(10,1) AS avg_staff_count,
  SUM(COALESCE(total_products, 0)) AS total_products,
  SUM(CASE WHEN had_deviations THEN 1 ELSE 0 END) AS projects_with_deviations,
  SUM(CASE WHEN had_late_changes THEN 1 ELSE 0 END) AS projects_with_late_changes,
  AVG(COALESCE(complexity_score, 0))::numeric(10,1) AS avg_complexity
FROM public.job_completion_analytics
GROUP BY organization_id, date_trunc('month', COALESCE(event_date::timestamp, completed_at));

-- 2. Product-project matrix (which products appear in which projects)
CREATE OR REPLACE VIEW public.v_product_project_matrix AS
SELECT
  cp.organization_id,
  cp.product_name,
  cp.category,
  cp.sku,
  jca.id AS completion_id,
  jca.booking_id,
  jca.client_name,
  jca.project_type,
  jca.geographic_area,
  COALESCE(jca.event_date::timestamp, jca.completed_at)::date AS project_date,
  cp.quantity,
  cp.unit_price,
  cp.total_price,
  cp.setup_hours,
  cp.material_cost,
  cp.external_cost,
  cp.is_package,
  cp.added_late,
  cp.caused_deviation,
  jca.total_hours_worked,
  jca.total_staff_count,
  jca.margin_percentage,
  jca.complexity_score
FROM public.completion_products cp
JOIN public.job_completion_analytics jca ON jca.id = cp.completion_id;

-- 3. Staff-project matrix (who works on what)
CREATE OR REPLACE VIEW public.v_staff_project_matrix AS
SELECT
  cs.organization_id,
  cs.staff_id,
  cs.staff_name,
  cs.role,
  jca.id AS completion_id,
  jca.booking_id,
  jca.client_name,
  jca.project_type,
  jca.geographic_area,
  COALESCE(jca.event_date::timestamp, jca.completed_at)::date AS project_date,
  cs.work_date,
  cs.hours_worked,
  cs.overtime_hours,
  cs.hourly_rate,
  cs.approved,
  (cs.hours_worked * cs.hourly_rate) AS labor_cost,
  jca.margin_percentage,
  jca.total_products,
  jca.complexity_score
FROM public.completion_staff cs
JOIN public.job_completion_analytics jca ON jca.id = cs.completion_id;

-- 4. Product category aggregation per month (for category trends)
CREATE OR REPLACE VIEW public.v_product_category_monthly AS
SELECT
  cp.organization_id,
  cp.category,
  date_trunc('month', COALESCE(jca.event_date::timestamp, jca.completed_at))::date AS month,
  COUNT(DISTINCT jca.id) AS project_count,
  SUM(cp.quantity) AS total_quantity,
  SUM(cp.total_price) AS total_revenue,
  SUM(cp.material_cost + cp.external_cost) AS total_cost,
  SUM(cp.setup_hours) AS total_setup_hours,
  SUM(CASE WHEN cp.added_late THEN 1 ELSE 0 END) AS late_additions,
  SUM(CASE WHEN cp.caused_deviation THEN 1 ELSE 0 END) AS caused_deviations
FROM public.completion_products cp
JOIN public.job_completion_analytics jca ON jca.id = cp.completion_id
GROUP BY cp.organization_id, cp.category, date_trunc('month', COALESCE(jca.event_date::timestamp, jca.completed_at));

-- 5. Staff performance over time
CREATE OR REPLACE VIEW public.v_staff_monthly_performance AS
SELECT
  cs.organization_id,
  cs.staff_id,
  cs.staff_name,
  date_trunc('month', cs.work_date::timestamp)::date AS month,
  COUNT(DISTINCT cs.completion_id) AS project_count,
  SUM(cs.hours_worked) AS total_hours,
  SUM(cs.overtime_hours) AS total_overtime,
  SUM(cs.hours_worked * cs.hourly_rate) AS total_labor_cost,
  AVG(jca.margin_percentage)::numeric(10,2) AS avg_project_margin
FROM public.completion_staff cs
JOIN public.job_completion_analytics jca ON jca.id = cs.completion_id
GROUP BY cs.organization_id, cs.staff_id, cs.staff_name, date_trunc('month', cs.work_date::timestamp);

-- 6. Product co-occurrence (which products appear together)
CREATE OR REPLACE VIEW public.v_product_combinations AS
SELECT
  a.organization_id,
  a.category AS category_a,
  b.category AS category_b,
  COUNT(DISTINCT a.completion_id) AS co_occurrence_count,
  AVG(jca.margin_percentage)::numeric(10,2) AS avg_margin_when_combined
FROM public.completion_products a
JOIN public.completion_products b ON a.completion_id = b.completion_id AND a.category < b.category
JOIN public.job_completion_analytics jca ON jca.id = a.completion_id
WHERE a.category IS NOT NULL AND b.category IS NOT NULL
GROUP BY a.organization_id, a.category, b.category
HAVING COUNT(DISTINCT a.completion_id) >= 2;

-- Additional time-series indexes
CREATE INDEX IF NOT EXISTS idx_jca_event_date ON public.job_completion_analytics(event_date);
CREATE INDEX IF NOT EXISTS idx_jca_completed_at ON public.job_completion_analytics(completed_at);
CREATE INDEX IF NOT EXISTS idx_jca_client_name ON public.job_completion_analytics(client_name);
CREATE INDEX IF NOT EXISTS idx_completion_staff_work_date ON public.completion_staff(work_date);
CREATE INDEX IF NOT EXISTS idx_completion_products_sku ON public.completion_products(sku);