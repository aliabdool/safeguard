-- =============================================================================================
-- STEP 3 (optional, incremental) — real properties + expanded department list.
--
-- Only run this if you ALREADY ran 2026-07-step1-migrations.sql and an earlier version of
-- 2026-07-step2-seed-and-demo-data.sql (the one without real properties). It's the delta on its
-- own: 8 additional departments, 5 real operating properties, and a safety-net cleanup for a
-- possible earlier seeding mistake. Safe to run more than once (ON CONFLICT DO NOTHING
-- throughout; the DELETE is an exact-name match).
--
-- If you have NOT yet run step 1 and step 2 at all, just run the current
-- 2026-07-step2-seed-and-demo-data.sql instead — it already includes everything in this file.
-- =============================================================================================

-- Departments. Core 11 plus 8 more grounded in the real Ambre Group board-dashboard taxonomy
-- (Kitchen and Stewarding are tracked separately from Food & Beverage there) and standard hotel
-- back-of-house functions.
insert into departments (code, name) values
  ('HOUSEKEEPING', 'Housekeeping'),
  ('FOOD_BEVERAGE', 'Food & Beverage'),
  ('KITCHEN', 'Kitchen'),
  ('STEWARDING', 'Stewarding'),
  ('ENGINEERING', 'Engineering & Maintenance'),
  ('FRONT_OFFICE', 'Front Office'),
  ('GUEST_RELATIONS', 'Guest Relations'),
  ('SECURITY', 'Security'),
  ('SPA_WELLNESS', 'Spa & Wellness'),
  ('RECREATION_ENTERTAINMENT', 'Recreation & Entertainment'),
  ('PUBLIC_AREA', 'Public Area'),
  ('GROUNDS_LANDSCAPING', 'Grounds & Landscaping'),
  ('HUMAN_RESOURCES', 'Human Resources'),
  ('FINANCE', 'Finance'),
  ('PURCHASING', 'Purchasing & Stores'),
  ('IT', 'IT & Systems'),
  ('SALES_MARKETING', 'Sales & Marketing'),
  ('ADMIN', 'Administration'),
  ('EXECUTIVE', 'Executive Office')
on conflict (code) do nothing;

-- Real operating properties.
insert into properties (code, name, brand, country) values
  ('SL-HOTELMGMT', 'Sunlife Hotel Management', 'Sunlife Collection', 'Mauritius'),
  ('LA-PIROGUE', 'La Pirogue Hotel', 'Sunlife Collection', 'Mauritius'),
  ('SUGAR-BEACH', 'Sugar Beach Hotel', 'Sunlife Collection', 'Mauritius'),
  ('LONG-BEACH', 'Long Beach Hotel', 'Sunlife Collection', 'Mauritius'),
  ('ILE-AUX-CERF', 'Ile Aux Cerf', 'Sunlife Collection', 'Mauritius')
on conflict (code) do nothing;

-- Link every real property to the full department list.
insert into property_departments (property_id, department_id)
select p.id, d.id
from properties p
cross join departments d
where p.code in ('SL-HOTELMGMT', 'LA-PIROGUE', 'SUGAR-BEACH', 'LONG-BEACH', 'ILE-AUX-CERF')
on conflict (property_id, department_id) do nothing;

-- Safety net: if an earlier, broken seed run ever inserted a department row using a property's
-- name by mistake (e.g. "Sunlife Beach Resort & Spa" showing up as a department), remove it.
-- Exact-name match only — will not touch a legitimately-named department.
delete from public.departments
where name in (select name from public.properties);
