-- Fix advisor "SECURITY DEFINER view": scenario_list now runs with the caller's privileges.
-- Clients get column-level SELECT on the safe columns only; system_prompt and rubric stay unreadable.

alter view public.scenario_list set (security_invoker = true);

revoke all on public.scenarios from anon, authenticated;
grant select (id, slug, language, title, active) on public.scenarios to authenticated;

-- RLS stays on; authenticated users may see active rows only.
alter table public.scenarios enable row level security;
drop policy if exists scenarios_select_active on public.scenarios;
create policy scenarios_select_active on public.scenarios
  for select to authenticated using (active);

revoke all on public.scenario_list from anon, authenticated;
grant select on public.scenario_list to authenticated;

-- service_role (chat/grade Edge Functions) keeps full access, including system_prompt and rubric.
grant all on public.scenarios to service_role;
