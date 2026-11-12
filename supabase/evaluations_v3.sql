-- =====================================================================
-- Manafeth Unified Evaluation System (v3.0) — server-side enforcement
-- All tables: RLS enabled, NO policies  => zero direct anon access.
-- All access goes through SECURITY DEFINER RPCs that validate a
-- server-issued session token and apply scope rules in SQL.
-- =====================================================================

-- ---------- 1) Server sessions ----------
create table if not exists public.manafeth_ops_sessions (
  token       text primary key,
  employee_id text not null,
  username    text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '14 hours'),
  revoked     boolean not null default false
);
alter table public.manafeth_ops_sessions enable row level security;

create or replace function public.manafeth_issue_session(p_username text, p_password text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_login jsonb; v_token text;
begin
  v_login := public.manafeth_verify_login(p_username, p_password);
  if coalesce((v_login->>'ok')::boolean, false) is not true then
    return v_login;
  end if;
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into public.manafeth_ops_sessions(token, employee_id, username)
  values (v_token, v_login->>'employeeId', v_login->>'username');
  delete from public.manafeth_ops_sessions where expires_at < now() - interval '2 days';
  return v_login || jsonb_build_object('token', v_token);
end $$;

create or replace function public.manafeth_revoke_session(p_token text)
returns void language sql security definer set search_path = public as $$
  update public.manafeth_ops_sessions set revoked = true where token = p_token;
$$;

-- ---------- 2) Authority table (server truth for evaluation rights) ----------
create table if not exists public.manafeth_eval_access (
  employee_id         text primary key,
  full_name           text,
  job_title           text,
  department_id       text,
  department_name     text,
  role_key            text not null default 'employee',
  view_scope          text not null default 'self' check (view_scope in ('self','department','club','system')),
  can_evaluate        boolean not null default false,
  can_manage          boolean not null default false,
  extra_department_ids text[] not null default '{}',
  updated_by          text,
  updated_at          timestamptz not null default now()
);
alter table public.manafeth_eval_access enable row level security;

create table if not exists public.manafeth_eval_criteria (
  id                       text primary key,
  name                     text not null,
  description              text,
  max_score                numeric not null default 10 check (max_score > 0),
  is_required              boolean not null default true,
  applies_to_levels        text[] not null default '{program}',
  applies_to_kinds         text[] not null default '{}',
  applies_to_program_types text[] not null default '{}',
  sort_order               int not null default 100,
  is_active                boolean not null default true,
  is_deleted               boolean not null default false,
  created_by               text,
  updated_by               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
alter table public.manafeth_eval_criteria enable row level security;

create table if not exists public.manafeth_eval_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.manafeth_eval_settings enable row level security;

create table if not exists public.manafeth_evaluations (
  id                      text primary key default ('EVL-' || replace(gen_random_uuid()::text,'-','')),
  target_kind             text not null check (target_kind in ('program_execution','sub_program','supervision','task')),
  target_id               text not null,
  eval_level              text not null check (eval_level in ('program','employee')),
  evaluated_employee_id   text not null default '',
  evaluated_employee_name text,
  evaluated_department_id text,
  program_name            text,
  sub_program_name        text,
  program_type            text,
  department_id           text,
  department_name         text,
  lead_employee_id        text,
  lead_employee_name      text,
  participant_names       text[] not null default '{}',
  exec_date               text,
  day_name                text,
  period_name             text,
  venue_name              text,
  scope_names             text[] not null default '{}',
  evaluator_employee_id   text not null,
  evaluator_username      text not null,
  evaluator_name          text not null,
  evaluator_role_label    text,
  scores                  jsonb not null default '[]'::jsonb,
  total_score             numeric,
  max_score               numeric,
  percent                 numeric,
  supervision_status      text,
  notes                   text,
  internal_notes          text,
  strengths               text,
  improvements            text,
  recommendations         text,
  attachment_name         text,
  attachment_url          text,
  share_with_employee     boolean not null default true,
  is_deleted              boolean not null default false,
  deleted_by              text,
  deleted_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (evaluator_employee_id, target_kind, target_id, eval_level, evaluated_employee_id)
);
create index if not exists idx_manafeth_evals_target on public.manafeth_evaluations(target_kind, target_id);
create index if not exists idx_manafeth_evals_emp on public.manafeth_evaluations(evaluated_employee_id);
create index if not exists idx_manafeth_evals_dept on public.manafeth_evaluations(department_id, evaluated_department_id);
alter table public.manafeth_evaluations enable row level security;

create table if not exists public.manafeth_eval_audit (
  id              text primary key default ('EAUD-' || replace(gen_random_uuid()::text,'-','')),
  created_at      timestamptz not null default now(),
  actor_employee_id text,
  actor_name      text,
  actor_role_key  text,
  action_type     text,
  entity_type     text,
  entity_id       text,
  entity_title    text,
  summary         text,
  previous_value  jsonb,
  new_value       jsonb,
  reason          text
);
alter table public.manafeth_eval_audit enable row level security;

-- ---------- 3) Internal helpers (not callable by clients) ----------
create or replace function public._eval_me(p_token text)
returns public.manafeth_eval_access
language plpgsql security definer set search_path = public as $$
declare
  v_sess public.manafeth_ops_sessions%rowtype;
  v_acc  public.manafeth_ops_accounts%rowtype;
  v_me   public.manafeth_eval_access%rowtype;
  v_payload jsonb; v_emp jsonb;
begin
  select * into v_sess from public.manafeth_ops_sessions
   where token = p_token and revoked = false and expires_at > now();
  if not found then
    raise exception 'انتهت الجلسة أو غير صالحة. يرجى تسجيل الدخول من جديد.' using hint = 'invalid_session';
  end if;
  select * into v_acc from public.manafeth_ops_accounts where employee_id = v_sess.employee_id;
  if not found or v_acc.account_status <> 'نشط' then
    raise exception 'هذا الحساب غير نشط.' using hint = 'invalid_session';
  end if;
  select * into v_me from public.manafeth_eval_access where employee_id = v_sess.employee_id;
  if not found then
    select payload into v_payload from public.manafeth_ops_state where doc_key = 'ops_overlay_v1';
    select e.v into v_emp from jsonb_array_elements(coalesce(v_payload->'employees','[]'::jsonb)) as e(v)
     where e.v->>'id' = v_sess.employee_id limit 1;
    insert into public.manafeth_eval_access(employee_id, full_name, job_title, department_id, department_name, role_key, updated_by)
    values (v_sess.employee_id, v_emp->>'name', v_emp->>'jobTitle', v_emp->>'departmentId', v_emp->>'departmentName', 'employee', 'auto_default')
    returning * into v_me;
  end if;
  return v_me;
end $$;

create or replace function public._eval_audit(
  p_me public.manafeth_eval_access, p_action text, p_entity_type text, p_entity_id text,
  p_title text, p_summary text, p_prev jsonb default null, p_new jsonb default null, p_reason text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.manafeth_eval_audit(actor_employee_id, actor_name, actor_role_key, action_type, entity_type, entity_id, entity_title, summary, previous_value, new_value, reason)
  values (p_me.employee_id, p_me.full_name, p_me.role_key, p_action, p_entity_type, p_entity_id, p_title, p_summary, p_prev, p_new, p_reason);
$$;

create or replace function public._eval_effective_scope(p_me public.manafeth_eval_access)
returns text language sql immutable as $$
  select case when p_me.can_manage then 'system' else p_me.view_scope end;
$$;

-- Resolves the TRUE facts of an evaluation target from the server-side state document.
create or replace function public._eval_resolve_target(p_kind text, p_target_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_payload jsonb; v_exec jsonb; v_sub jsonb; v_task jsonb; v_duty jsonb;
  v_parts text[]; v_exec_id text; v_sub_id text;
  v_lead text; v_ids text[]; v_dept_id text; v_dept_name text; v_venue_id text; v_venue text;
  v_scope_names text[]; v_emp_list jsonb; v_status text; v_date text; v_day text; v_period text;
  v_program text; v_sub_name text; v_ptype text; v_pkey text; v_loc text; v_employee text; v_ename text;
  v_today date;
begin
  select payload into v_payload from public.manafeth_ops_state where doc_key = 'ops_overlay_v1';
  if v_payload is null then return null; end if;

  if p_kind in ('program_execution','sub_program') then
    v_parts := string_to_array(p_target_id, '::');
    v_exec_id := v_parts[1];
    v_sub_id := v_parts[2];
    if p_kind = 'sub_program' and v_sub_id is null then return null; end if;
    if p_kind = 'program_execution' and v_sub_id is not null then return null; end if;
    select x.v into v_exec from jsonb_array_elements(coalesce(v_payload->'scheduledExecutions','[]'::jsonb)) as x(v)
     where x.v->>'id' = v_exec_id limit 1;
    if v_exec is null then return null; end if;

    v_program := v_exec->>'programName';
    v_ptype := v_exec->>'programType';
    v_dept_id := v_exec->>'departmentId';
    v_status := v_exec->>'status';
    v_date := v_exec->>'executionDate';
    v_day := v_exec->>'day';
    v_period := v_exec->>'periodName';
    v_venue_id := v_exec->>'venueId';
    v_lead := v_exec->>'leadEmployeeId';
    select coalesce(array_agg(t), '{}') into v_ids from jsonb_array_elements_text(coalesce(v_exec->'participatingEmployeeIds','[]'::jsonb)) t;

    if p_kind = 'sub_program' then
      select x.v into v_sub from jsonb_array_elements(coalesce(v_exec->'subPrograms','[]'::jsonb)) as x(v)
       where x.v->>'id' = v_sub_id limit 1;
      if v_sub is null then return null; end if;
      v_sub_name := v_sub->>'name';
      v_date := coalesce(nullif(v_sub->>'executionDate',''), v_date);
      v_day := coalesce(nullif(v_sub->>'day',''), v_day);
      v_period := coalesce(nullif(v_sub->>'periodName',''), v_period);
      v_venue_id := coalesce(nullif(v_sub->>'venueId',''), v_venue_id);
      v_lead := coalesce(nullif(v_sub->>'leadEmployeeId',''), v_lead);
      select coalesce(array_agg(t), '{}') into v_ids from jsonb_array_elements_text(coalesce(v_sub->'participatingEmployeeIds','[]'::jsonb)) t;
    end if;

    select z.v->>'name' into v_venue from jsonb_array_elements(coalesce(v_payload->'venues','[]'::jsonb)) as z(v)
     where z.v->>'id' = v_venue_id limit 1;
    select coalesce(array_agg(s.v->>'name'), '{}') into v_scope_names
      from jsonb_array_elements(coalesce(v_payload->'scopes','[]'::jsonb)) as s(v)
     where (s.v->>'id') in (select jsonb_array_elements_text(coalesce(v_exec->'scopeIds','[]'::jsonb)));
    select coalesce(jsonb_agg(jsonb_build_object('id', e.v->>'id', 'name', e.v->>'name')), '[]'::jsonb) into v_emp_list
      from jsonb_array_elements(coalesce(v_payload->'employees','[]'::jsonb)) as e(v)
     where e.v->>'id' = any(array_append(v_ids, v_lead));
    select d.v->>'name' into v_dept_name from jsonb_array_elements(coalesce(v_payload->'departments','[]'::jsonb)) as d(v)
     where d.v->>'id' = v_dept_id limit 1;

    return jsonb_build_object(
      'kind', p_kind, 'targetId', p_target_id, 'programName', v_program, 'subProgramName', v_sub_name,
      'programType', v_ptype, 'departmentId', v_dept_id, 'departmentName', coalesce(v_dept_name, v_exec->>'departmentName'),
      'leadEmployeeId', v_lead, 'participantIds', to_jsonb(v_ids), 'execDate', v_date, 'dayName', v_day,
      'periodName', v_period, 'venueName', v_venue, 'scopeNames', to_jsonb(v_scope_names),
      'status', v_status, 'employees', v_emp_list);

  elsif p_kind = 'task' then
    select x.v into v_task from jsonb_array_elements(coalesce(v_payload->'tasks','[]'::jsonb)) as x(v)
     where x.v->>'id' = p_target_id limit 1;
    if v_task is null then return null; end if;
    v_lead := v_task->>'assignedEmployeeId';
    v_dept_id := v_task->>'departmentId';
    select d.v->>'name' into v_dept_name from jsonb_array_elements(coalesce(v_payload->'departments','[]'::jsonb)) as d(v)
     where d.v->>'id' = v_dept_id limit 1;
    select coalesce(jsonb_agg(jsonb_build_object('id', e.v->>'id', 'name', e.v->>'name')), '[]'::jsonb) into v_emp_list
      from jsonb_array_elements(coalesce(v_payload->'employees','[]'::jsonb)) as e(v) where e.v->>'id' = v_lead;
    return jsonb_build_object(
      'kind', p_kind, 'targetId', p_target_id, 'programName', v_task->>'title', 'subProgramName', null,
      'programType', 'تكليف تشغيلي', 'departmentId', v_dept_id, 'departmentName', coalesce(v_dept_name, v_task->>'departmentName'),
      'leadEmployeeId', v_lead, 'participantIds', '[]'::jsonb, 'execDate', v_task->>'dueDate', 'dayName', null,
      'periodName', null, 'venueName', null, 'scopeNames', '[]'::jsonb,
      'status', v_task->>'status', 'employees', v_emp_list);

  elsif p_kind = 'supervision' then
    -- target id format: DUTYID|YYYY-MM-DD|periodKey
    v_parts := string_to_array(p_target_id, '|');
    if array_length(v_parts, 1) <> 3 then return null; end if;
    if v_parts[2] !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
    v_pkey := v_parts[3];
    if v_pkey not in ('reception','asr','maghrib','isha','dismissal') then return null; end if;
    v_today := (now() at time zone 'Asia/Riyadh')::date;
    if v_parts[2]::date > v_today then return null; end if;
    select x.v into v_duty from jsonb_array_elements(coalesce(v_payload->'supervisionDuties','[]'::jsonb)) as x(v)
     where x.v->>'id' = v_parts[1] limit 1;
    if v_duty is null then return null; end if;
    v_employee := v_duty->>'employeeId';
    v_loc := case v_pkey when 'reception' then v_duty->>'reception' when 'asr' then v_duty->>'asrHall'
                          when 'maghrib' then v_duty->>'maghribHall' when 'isha' then v_duty->>'ishaHall'
                          else v_duty->>'dismissal' end;
    select e.v->>'name', e.v->>'departmentId' into v_ename, v_dept_id
      from jsonb_array_elements(coalesce(v_payload->'employees','[]'::jsonb)) as e(v) where e.v->>'id' = v_employee limit 1;
    select d.v->>'name' into v_dept_name from jsonb_array_elements(coalesce(v_payload->'departments','[]'::jsonb)) as d(v)
     where d.v->>'id' = v_dept_id limit 1;
    return jsonb_build_object(
      'kind', p_kind, 'targetId', p_target_id,
      'programName', 'الإشراف اليومي — ' || case v_pkey when 'reception' then 'استقبال الطلاب' when 'asr' then 'قبل صلاة العصر'
                         when 'maghrib' then 'قبل صلاة المغرب' when 'isha' then 'قبل صلاة العشاء' else 'أثناء الانصراف' end,
      'subProgramName', null, 'programType', 'إشراف', 'departmentId', v_dept_id,
      'departmentName', coalesce(v_dept_name, 'الإدارة العامة للنادي'), 'leadEmployeeId', v_employee,
      'participantIds', '[]'::jsonb, 'execDate', v_parts[2], 'dayName', null,
      'periodName', v_pkey, 'venueName', v_loc, 'scopeNames', '[]'::jsonb, 'status', 'منفذ',
      'generalSupervisorId', v_duty->>'generalSupervisorId', 'systemSupervisorId', v_duty->>'systemSupervisorId',
      'employees', jsonb_build_array(jsonb_build_object('id', v_employee, 'name', v_ename)));
  end if;
  return null;
end $$;

-- lock internal helpers
revoke execute on function public._eval_me(text) from public, anon, authenticated;
revoke execute on function public._eval_audit(public.manafeth_eval_access, text, text, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public._eval_effective_scope(public.manafeth_eval_access) from public, anon, authenticated;
revoke execute on function public._eval_resolve_target(text, text) from public, anon, authenticated;

-- ---------- 4) Public RPCs ----------
create or replace function public.manafeth_eval_me(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me public.manafeth_eval_access;
begin
  v_me := public._eval_me(p_token);
  return jsonb_build_object(
    'employeeId', v_me.employee_id, 'fullName', v_me.full_name, 'departmentId', v_me.department_id,
    'roleKey', v_me.role_key, 'viewScope', public._eval_effective_scope(v_me),
    'canEvaluate', (v_me.can_evaluate or v_me.can_manage), 'canManage', v_me.can_manage,
    'extraDepartmentIds', to_jsonb(v_me.extra_department_ids));
end $$;

create or replace function public.manafeth_eval_get_criteria(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me public.manafeth_eval_access;
begin
  v_me := public._eval_me(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'description', c.description, 'maxScore', c.max_score,
      'isRequired', c.is_required, 'levels', to_jsonb(c.applies_to_levels), 'kinds', to_jsonb(c.applies_to_kinds),
      'programTypes', to_jsonb(c.applies_to_program_types), 'sortOrder', c.sort_order,
      'isActive', c.is_active, 'isDeleted', c.is_deleted) order by c.sort_order, c.created_at)
    from public.manafeth_eval_criteria c
    where c.is_deleted = false and (c.is_active = true or v_me.can_manage)), '[]'::jsonb);
end $$;

create or replace function public.manafeth_eval_get_settings(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me public.manafeth_eval_access;
begin
  v_me := public._eval_me(p_token);
  return coalesce((select jsonb_object_agg(key, value) from public.manafeth_eval_settings), '{}'::jsonb);
end $$;

create or replace function public.manafeth_eval_submit(p_token text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me public.manafeth_eval_access;
  v_kind text := p_input->>'targetKind';
  v_tid  text := p_input->>'targetId';
  v_level text := coalesce(p_input->>'evalLevel', 'program');
  v_emp text := coalesce(p_input->>'evaluatedEmployeeId', '');
  v_facts jsonb; v_status text; v_allowed jsonb; v_ok boolean := false;
  v_scope text; v_dept text;
  v_crit record; v_in jsonb; v_score numeric; v_scores jsonb := '[]'::jsonb;
  v_total numeric := 0; v_max numeric := 0; v_pct numeric; v_count int := 0;
  v_empname text; v_empdept text; v_existing public.manafeth_evaluations%rowtype;
  v_sup_status text := nullif(trim(coalesce(p_input->>'supervisionStatus','')), '');
  v_sup_opt jsonb; v_sup_score numeric; v_id text; v_role_label text; v_prev jsonb;
  v_lead_name text; v_part_names text[];
  v_attach text := nullif(trim(coalesce(p_input->>'attachmentUrl','')), '');
begin
  v_me := public._eval_me(p_token);
  if v_kind not in ('program_execution','sub_program','supervision','task') then
    raise exception 'نوع العنصر المراد تقييمه غير صالح.';
  end if;
  if v_level not in ('program','employee') then raise exception 'مستوى التقييم غير صالح.'; end if;

  v_facts := public._eval_resolve_target(v_kind, v_tid);
  if v_facts is null then
    raise exception 'تعذر العثور على العنصر المراد تقييمه في النظام (قد لا يكون تمت مزامنته بعد).';
  end if;
  v_dept := v_facts->>'departmentId';

  -- status gating (only executed items by default; management can configure)
  select value into v_allowed from public.manafeth_eval_settings where key = 'allowed_statuses';
  if v_allowed is not null and v_allowed ? v_kind and jsonb_array_length(v_allowed->v_kind) > 0
     and not ((v_allowed->v_kind) ? coalesce(v_facts->>'status','')) then
    raise exception 'لا يمكن التقييم قبل أن تصبح الحالة ضمن: % (الحالة الحالية: %).',
      (select string_agg(x, '، ') from jsonb_array_elements_text(v_allowed->v_kind) x), coalesce(v_facts->>'status','—');
  end if;

  -- authority
  v_scope := public._eval_effective_scope(v_me);
  if v_me.can_manage then v_ok := true;
  elsif v_me.can_evaluate then
    if v_scope in ('club','system','self') then v_ok := true;
    elsif v_scope = 'department' and (v_dept = v_me.department_id or v_dept = any(v_me.extra_department_ids)) then v_ok := true;
    end if;
  end if;
  if not v_ok and v_kind = 'supervision'
     and v_me.employee_id in (coalesce(v_facts->>'generalSupervisorId',''), coalesce(v_facts->>'systemSupervisorId','')) then
    v_ok := true;
  end if;
  if not v_ok then raise exception 'ليست لديك صلاحية تقييم هذا العنصر.'; end if;

  -- level/employee validation
  if v_level = 'employee' then
    if v_emp = '' then raise exception 'يرجى تحديد الموظف المراد تقييم أدائه.'; end if;
    if not exists (select 1 from jsonb_array_elements(v_facts->'employees') e where e->>'id' = v_emp) then
      raise exception 'الموظف المحدد ليس ضمن موظفي هذا البرنامج/النشاط.';
    end if;
    if v_emp = v_me.employee_id then raise exception 'لا يمكنك تقييم أدائك الشخصي.'; end if;
    select e->>'name' into v_empname from jsonb_array_elements(v_facts->'employees') e where e->>'id' = v_emp limit 1;
    select department_id into v_empdept from public.manafeth_eval_access where employee_id = v_emp;
    v_empdept := coalesce(v_empdept, v_dept);
  else
    v_emp := '';
  end if;
  if v_kind = 'supervision' and v_level <> 'employee' then raise exception 'تقييم الإشراف يتم على مستوى الموظف.'; end if;

  -- criteria scores (server recomputed)
  for v_crit in
    select * from public.manafeth_eval_criteria c
     where c.is_active and not c.is_deleted and v_level = any(c.applies_to_levels)
       and (cardinality(c.applies_to_kinds) = 0 or v_kind = any(c.applies_to_kinds))
       and (cardinality(c.applies_to_program_types) = 0 or coalesce(v_facts->>'programType','') = any(c.applies_to_program_types))
     order by c.sort_order, c.created_at
  loop
    select s into v_in from jsonb_array_elements(coalesce(p_input->'scores','[]'::jsonb)) s
     where s->>'criterionId' = v_crit.id limit 1;
    if v_in is null or nullif(v_in->>'score','') is null then
      if v_crit.is_required then raise exception 'المعيار «%» إلزامي.', v_crit.name; end if;
      continue;
    end if;
    v_score := (v_in->>'score')::numeric;
    if v_score < 0 or v_score > v_crit.max_score then
      raise exception 'درجة المعيار «%» يجب أن تكون بين 0 و %.', v_crit.name, v_crit.max_score;
    end if;
    v_scores := v_scores || jsonb_build_array(jsonb_build_object('criterionId', v_crit.id, 'name', v_crit.name, 'score', v_score, 'max', v_crit.max_score));
    v_total := v_total + v_score; v_max := v_max + v_crit.max_score; v_count := v_count + 1;
  end loop;

  if v_kind = 'supervision' then
    if v_sup_status is null then raise exception 'يرجى اختيار حالة التقييم.'; end if;
    select value into v_sup_opt from public.manafeth_eval_settings where key = 'supervision_statuses';
    select o into v_sup_opt from jsonb_array_elements(coalesce(v_sup_opt,'[]'::jsonb)) o where o->>'label' = v_sup_status limit 1;
    if v_sup_opt is null then raise exception 'حالة التقييم غير معرّفة في الإعدادات.'; end if;
    if nullif(v_sup_opt->>'score','') is not null then v_sup_score := (v_sup_opt->>'score')::numeric; end if;
    if v_count = 0 then
      v_pct := v_sup_score;
    else
      v_pct := round(100 * v_total / v_max, 1);
    end if;
  else
    if v_count = 0 then raise exception 'يرجى تقييم معيار واحد على الأقل.'; end if;
    v_pct := round(100 * v_total / v_max, 1);
    v_sup_status := null;
  end if;

  select e->>'name' into v_lead_name from jsonb_array_elements(v_facts->'employees') e where e->>'id' = coalesce(v_facts->>'leadEmployeeId','') limit 1;
  select coalesce(array_agg(e->>'name'), '{}') into v_part_names from jsonb_array_elements(v_facts->'employees') e
   where e->>'id' in (select jsonb_array_elements_text(coalesce(v_facts->'participantIds','[]'::jsonb)));
  v_role_label := case v_me.role_key when 'full_admin' then 'مدير نظام' when 'club_director' then 'مدير النادي'
                  when 'dept_head' then 'رئيس قسم' else coalesce(v_me.job_title,'مقيّم') end;

  select * into v_existing from public.manafeth_evaluations
   where evaluator_employee_id = v_me.employee_id and target_kind = v_kind and target_id = v_tid
     and eval_level = v_level and evaluated_employee_id = v_emp;
  if found and v_existing.is_deleted and not v_me.can_manage then
    raise exception 'تم حذف تقييمك السابق لهذا العنصر من قبل الإدارة ولا يمكن إعادة إنشائه.';
  end if;

  if found then
    v_prev := jsonb_build_object('percent', v_existing.percent, 'scores', v_existing.scores);
    update public.manafeth_evaluations set
      scores = v_scores, total_score = v_total, max_score = v_max, percent = v_pct, supervision_status = v_sup_status,
      notes = nullif(trim(coalesce(p_input->>'notes','')), ''), internal_notes = nullif(trim(coalesce(p_input->>'internalNotes','')), ''),
      strengths = nullif(trim(coalesce(p_input->>'strengths','')), ''), improvements = nullif(trim(coalesce(p_input->>'improvements','')), ''),
      recommendations = nullif(trim(coalesce(p_input->>'recommendations','')), ''),
      attachment_name = case when v_attach is null then null else nullif(trim(coalesce(p_input->>'attachmentName','')), '') end,
      attachment_url = v_attach,
      share_with_employee = coalesce((p_input->>'shareWithEmployee')::boolean, true),
      is_deleted = false, deleted_by = null, deleted_at = null, updated_at = now(),
      program_name = v_facts->>'programName', sub_program_name = v_facts->>'subProgramName', program_type = v_facts->>'programType',
      department_id = v_dept, department_name = v_facts->>'departmentName', exec_date = v_facts->>'execDate',
      day_name = v_facts->>'dayName', period_name = v_facts->>'periodName', venue_name = v_facts->>'venueName',
      lead_employee_id = v_facts->>'leadEmployeeId', lead_employee_name = v_lead_name, participant_names = v_part_names,
      scope_names = coalesce((select array_agg(x) from jsonb_array_elements_text(v_facts->'scopeNames') x), '{}')
    where id = v_existing.id
    returning id into v_id;
    perform public._eval_audit(v_me, 'تعديل تقييم', 'evaluation', v_id, coalesce(v_facts->>'programName','—'),
      format('عدّل «%s» تقييمه لـ «%s» (%s) — النتيجة %s%%.', v_me.full_name, coalesce(v_facts->>'programName','—'),
        case v_level when 'employee' then 'أداء ' || coalesce(v_empname,'') else 'البرنامج' end, coalesce(v_pct::text,'—')),
      v_prev, jsonb_build_object('percent', v_pct));
  else
    insert into public.manafeth_evaluations(
      target_kind, target_id, eval_level, evaluated_employee_id, evaluated_employee_name, evaluated_department_id,
      program_name, sub_program_name, program_type, department_id, department_name, lead_employee_id, lead_employee_name,
      participant_names, exec_date, day_name, period_name, venue_name, scope_names,
      evaluator_employee_id, evaluator_username, evaluator_name, evaluator_role_label,
      scores, total_score, max_score, percent, supervision_status, notes, internal_notes, strengths, improvements,
      recommendations, attachment_name, attachment_url, share_with_employee)
    values (
      v_kind, v_tid, v_level, v_emp, v_empname, case when v_level='employee' then v_empdept else null end,
      v_facts->>'programName', v_facts->>'subProgramName', v_facts->>'programType', v_dept, v_facts->>'departmentName',
      v_facts->>'leadEmployeeId', v_lead_name, v_part_names, v_facts->>'execDate', v_facts->>'dayName',
      v_facts->>'periodName', v_facts->>'venueName',
      coalesce((select array_agg(x) from jsonb_array_elements_text(v_facts->'scopeNames') x), '{}'),
      v_me.employee_id,
      (select username from public.manafeth_ops_accounts where employee_id = v_me.employee_id), v_me.full_name, v_role_label,
      v_scores, v_total, v_max, v_pct, v_sup_status,
      nullif(trim(coalesce(p_input->>'notes','')), ''), nullif(trim(coalesce(p_input->>'internalNotes','')), ''),
      nullif(trim(coalesce(p_input->>'strengths','')), ''), nullif(trim(coalesce(p_input->>'improvements','')), ''),
      nullif(trim(coalesce(p_input->>'recommendations','')), ''),
      case when v_attach is null then null else nullif(trim(coalesce(p_input->>'attachmentName','')), '') end, v_attach,
      coalesce((p_input->>'shareWithEmployee')::boolean, true))
    returning id into v_id;
    perform public._eval_audit(v_me, 'إضافة تقييم', 'evaluation', v_id, coalesce(v_facts->>'programName','—'),
      format('قيّم «%s» «%s» (%s) — النتيجة %s%%.', v_me.full_name, coalesce(v_facts->>'programName','—'),
        case v_level when 'employee' then 'أداء ' || coalesce(v_empname,'') else 'البرنامج' end, coalesce(v_pct::text,'—')),
      null, jsonb_build_object('percent', v_pct, 'kind', v_kind, 'level', v_level));
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'percent', v_pct);
end $$;

create or replace function public.manafeth_eval_list(p_token text, p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me public.manafeth_eval_access; v_scope text; v_depts text[];
  v_kind text := nullif(p_filters->>'targetKind','');
  v_from text := nullif(p_filters->>'from','');
  v_to   text := nullif(p_filters->>'to','');
  v_result jsonb;
begin
  v_me := public._eval_me(p_token);
  v_scope := public._eval_effective_scope(v_me);
  v_depts := array_append(v_me.extra_department_ids, v_me.department_id);

  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb) into v_result
  from (
    select e.created_at,
      jsonb_build_object(
        'id', e.id, 'targetKind', e.target_kind, 'targetId', e.target_id, 'evalLevel', e.eval_level,
        'evaluatedEmployeeId', nullif(e.evaluated_employee_id,''), 'evaluatedEmployeeName', e.evaluated_employee_name,
        'evaluatedDepartmentId', e.evaluated_department_id,
        'programName', e.program_name, 'subProgramName', e.sub_program_name, 'programType', e.program_type,
        'departmentId', e.department_id, 'departmentName', e.department_name,
        'leadEmployeeId', e.lead_employee_id, 'leadEmployeeName', e.lead_employee_name,
        'participantNames', to_jsonb(e.participant_names), 'execDate', e.exec_date, 'dayName', e.day_name,
        'periodName', e.period_name, 'venueName', e.venue_name, 'scopeNames', to_jsonb(e.scope_names),
        'evaluatorEmployeeId', e.evaluator_employee_id, 'evaluatorUsername', e.evaluator_username,
        'evaluatorName', e.evaluator_name, 'evaluatorRoleLabel', e.evaluator_role_label,
        'scores', e.scores, 'totalScore', e.total_score, 'maxScore', e.max_score, 'percent', e.percent,
        'supervisionStatus', e.supervision_status,
        'attachmentName', e.attachment_name, 'attachmentUrl', e.attachment_url,
        'shareWithEmployee', e.share_with_employee, 'isDeleted', e.is_deleted,
        'createdAt', e.created_at, 'updatedAt', e.updated_at,
        'isMine', (e.evaluator_employee_id = v_me.employee_id),
        'masked', masked,
        'notes',           case when masked and not e.share_with_employee then null else e.notes end,
        'strengths',       case when masked and not e.share_with_employee then null else e.strengths end,
        'improvements',    case when masked and not e.share_with_employee then null else e.improvements end,
        'recommendations', case when masked and not e.share_with_employee then null else e.recommendations end,
        'internalNotes',   case when masked then null else e.internal_notes end
      ) as row_json
    from public.manafeth_evaluations e
    cross join lateral (
      select (e.evaluator_employee_id <> v_me.employee_id and not v_me.can_manage
              and (e.evaluated_employee_id = v_me.employee_id
                   or (e.eval_level = 'program' and e.lead_employee_id = v_me.employee_id)
                   or v_scope = 'self')) as masked
    ) m
    where (e.is_deleted = false or v_me.can_manage)
      and (
        v_scope in ('club','system')
        or e.evaluator_employee_id = v_me.employee_id
        or e.evaluated_employee_id = v_me.employee_id
        or (e.eval_level = 'program' and e.lead_employee_id = v_me.employee_id)
        or (v_scope = 'department' and (e.department_id = any(v_depts) or e.evaluated_department_id = any(v_depts)))
      )
      and (v_kind is null or e.target_kind = v_kind)
      and (v_from is null or e.exec_date >= v_from)
      and (v_to is null or e.exec_date <= v_to)
    limit 3000
  ) q;
  return v_result;
end $$;

create or replace function public.manafeth_eval_delete(p_token text, p_id text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me public.manafeth_eval_access; v_e public.manafeth_evaluations%rowtype;
begin
  v_me := public._eval_me(p_token);
  if not v_me.can_manage then raise exception 'حذف التقييمات متاح لمدير النظام فقط.'; end if;
  update public.manafeth_evaluations set is_deleted = true, deleted_by = v_me.full_name, deleted_at = now()
   where id = p_id returning * into v_e;
  if not found then raise exception 'التقييم غير موجود.'; end if;
  perform public._eval_audit(v_me, 'حذف تقييم', 'evaluation', p_id, v_e.program_name,
    format('حذف «%s» تقييم «%s» الخاص بـ «%s».', v_me.full_name, coalesce(v_e.evaluator_name,'—'), coalesce(v_e.program_name,'—')),
    jsonb_build_object('percent', v_e.percent), null, p_reason);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.manafeth_eval_restore(p_token text, p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me public.manafeth_eval_access; v_e public.manafeth_evaluations%rowtype;
begin
  v_me := public._eval_me(p_token);
  if not v_me.can_manage then raise exception 'استرجاع التقييمات متاح لمدير النظام فقط.'; end if;
  update public.manafeth_evaluations set is_deleted = false, deleted_by = null, deleted_at = null
   where id = p_id returning * into v_e;
  if not found then raise exception 'التقييم غير موجود.'; end if;
  perform public._eval_audit(v_me, 'استرجاع تقييم', 'evaluation', p_id, v_e.program_name,
    format('استرجع «%s» تقييم «%s» الخاص بـ «%s».', v_me.full_name, coalesce(v_e.evaluator_name,'—'), coalesce(v_e.program_name,'—')));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 5) Admin RPCs ----------
create or replace function public.manafeth_eval_save_criterion(p_token text, p_criterion jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me public.manafeth_eval_access; v_id text := nullif(p_criterion->>'id',''); v_prev jsonb; v_levels text[]; v_kinds text[]; v_types text[];
begin
  v_me := public._eval_me(p_token);
  if not v_me.can_manage then raise exception 'إدارة معايير التقييم متاحة لمدير النظام فقط.'; end if;
  if coalesce(trim(p_criterion->>'name'),'') = '' then raise exception 'اسم المعيار مطلوب.'; end if;
  if coalesce((p_criterion->>'maxScore')::numeric, 0) <= 0 then raise exception 'درجة المعيار يجب أن تكون أكبر من صفر.'; end if;
  select coalesce(array_agg(x), '{program}') into v_levels from jsonb_array_elements_text(coalesce(p_criterion->'levels','["program"]'::jsonb)) x;
  select coalesce(array_agg(x), '{}') into v_kinds from jsonb_array_elements_text(coalesce(p_criterion->'kinds','[]'::jsonb)) x;
  select coalesce(array_agg(x), '{}') into v_types from jsonb_array_elements_text(coalesce(p_criterion->'programTypes','[]'::jsonb)) x;
  if v_id is not null and exists (select 1 from public.manafeth_eval_criteria where id = v_id) then
    select to_jsonb(c) into v_prev from public.manafeth_eval_criteria c where id = v_id;
    update public.manafeth_eval_criteria set name = trim(p_criterion->>'name'), description = p_criterion->>'description',
      max_score = (p_criterion->>'maxScore')::numeric, is_required = coalesce((p_criterion->>'isRequired')::boolean, true),
      applies_to_levels = v_levels, applies_to_kinds = v_kinds, applies_to_program_types = v_types,
      sort_order = coalesce((p_criterion->>'sortOrder')::int, sort_order), is_active = coalesce((p_criterion->>'isActive')::boolean, true),
      updated_by = v_me.full_name, updated_at = now() where id = v_id;
    perform public._eval_audit(v_me, 'تعديل معيار تقييم', 'eval_criterion', v_id, p_criterion->>'name', format('عدّل «%s» معيار التقييم «%s».', v_me.full_name, p_criterion->>'name'), v_prev, p_criterion);
  else
    v_id := coalesce(v_id, 'CRT-' || substr(replace(gen_random_uuid()::text,'-',''),1,10));
    insert into public.manafeth_eval_criteria(id, name, description, max_score, is_required, applies_to_levels, applies_to_kinds, applies_to_program_types, sort_order, is_active, created_by, updated_by)
    values (v_id, trim(p_criterion->>'name'), p_criterion->>'description', (p_criterion->>'maxScore')::numeric,
      coalesce((p_criterion->>'isRequired')::boolean, true), v_levels, v_kinds, v_types,
      coalesce((p_criterion->>'sortOrder')::int, 100), coalesce((p_criterion->>'isActive')::boolean, true), v_me.full_name, v_me.full_name);
    perform public._eval_audit(v_me, 'إضافة معيار تقييم', 'eval_criterion', v_id, p_criterion->>'name', format('أضاف «%s» معيار التقييم «%s».', v_me.full_name, p_criterion->>'name'), null, p_criterion);
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.manafeth_eval_delete_criterion(p_token text, p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me public.manafeth_eval_access; v_name text;
begin
  v_me := public._eval_me(p_token);
  if not v_me.can_manage then raise exception 'إدارة معايير التقييم متاحة لمدير النظام فقط.'; end if;
  update public.manafeth_eval_criteria set is_deleted = true, is_active = false, updated_by = v_me.full_name, updated_at = now()
   where id = p_id returning name into v_name;
  if not found then raise exception 'المعيار غير موجود.'; end if;
  perform public._eval_audit(v_me, 'حذف معيار تقييم', 'eval_criterion', p_id, v_name, format('حذف «%s» معيار التقييم «%s» (يبقى في التقييمات السابقة كنسخة تاريخية).', v_me.full_name, v_name));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.manafeth_eval_save_setting(p_token text, p_key text, p_value jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me public.manafeth_eval_access;
begin
  v_me := public._eval_me(p_token);
  if not v_me.can_manage then raise exception 'إدارة إعدادات التقييم متاحة لمدير النظام فقط.'; end if;
  if p_key not in ('allowed_statuses','supervision_statuses') then raise exception 'مفتاح إعداد غير معروف.'; end if;
  insert into public.manafeth_eval_settings(key, value, updated_by) values (p_key, p_value, v_me.full_name)
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  perform public._eval_audit(v_me, 'تعديل إعدادات التقييم', 'eval_setting', p_key, p_key, format('عدّل «%s» إعداد التقييم «%s».', v_me.full_name, p_key), null, p_value);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.manafeth_eval_admin_get_access(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me public.manafeth_eval_access;
begin
  v_me := public._eval_me(p_token);
  if not v_me.can_manage then raise exception 'متاح لمدير النظام فقط.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'employeeId', a.employee_id, 'fullName', a.full_name, 'jobTitle', a.job_title, 'departmentId', a.department_id,
    'departmentName', a.department_name, 'roleKey', a.role_key, 'viewScope', a.view_scope, 'canEvaluate', a.can_evaluate,
    'canManage', a.can_manage, 'extraDepartmentIds', to_jsonb(a.extra_department_ids)) order by a.employee_id)
    from public.manafeth_eval_access a), '[]'::jsonb);
end $$;

create or replace function public.manafeth_eval_admin_set_access(p_token text, p_employee_id text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me public.manafeth_eval_access; v_old public.manafeth_eval_access%rowtype; v_extra text[]; v_scope text;
begin
  v_me := public._eval_me(p_token);
  if not v_me.can_manage then raise exception 'إدارة صلاحيات التقييم متاحة لمدير النظام فقط.'; end if;
  select * into v_old from public.manafeth_eval_access where employee_id = p_employee_id;
  if not found then raise exception 'الموظف غير موجود في سجل صلاحيات التقييم. استخدم «مزامنة الدليل» أولًا.'; end if;
  v_scope := coalesce(p_patch->>'viewScope', v_old.view_scope);
  if v_scope not in ('self','department','club','system') then raise exception 'نطاق مشاهدة غير صالح.'; end if;
  if p_patch ? 'extraDepartmentIds' then
    select coalesce(array_agg(x), '{}') into v_extra from jsonb_array_elements_text(p_patch->'extraDepartmentIds') x;
  else v_extra := v_old.extra_department_ids; end if;
  if p_employee_id = v_me.employee_id and coalesce((p_patch->>'canManage')::boolean, v_old.can_manage) = false then
    raise exception 'لا يمكنك سحب صلاحية الإدارة من حسابك الحالي.';
  end if;
  update public.manafeth_eval_access set
    view_scope = v_scope,
    can_evaluate = coalesce((p_patch->>'canEvaluate')::boolean, can_evaluate),
    can_manage = coalesce((p_patch->>'canManage')::boolean, can_manage),
    role_key = coalesce(p_patch->>'roleKey', role_key),
    department_id = coalesce(p_patch->>'departmentId', department_id),
    department_name = coalesce(p_patch->>'departmentName', department_name),
    extra_department_ids = v_extra, updated_by = v_me.full_name, updated_at = now()
  where employee_id = p_employee_id;
  perform public._eval_audit(v_me, 'تعديل صلاحيات التقييم', 'eval_access', p_employee_id, v_old.full_name,
    format('عدّل «%s» صلاحيات التقييم للموظف «%s».', v_me.full_name, v_old.full_name),
    jsonb_build_object('viewScope', v_old.view_scope, 'canEvaluate', v_old.can_evaluate, 'canManage', v_old.can_manage, 'extra', v_old.extra_department_ids),
    p_patch);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.manafeth_eval_admin_sync_directory(p_token text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me public.manafeth_eval_access; r jsonb; v_added int := 0; v_updated int := 0; v_role text; v_scope text;
begin
  v_me := public._eval_me(p_token);
  if not v_me.can_manage then raise exception 'متاح لمدير النظام فقط.'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    v_role := coalesce(r->>'roleKey','employee');
    v_scope := case v_role when 'full_admin' then 'system' when 'club_director' then 'club' when 'dept_head' then 'department' else 'self' end;
    if exists (select 1 from public.manafeth_eval_access where employee_id = r->>'employeeId') then
      update public.manafeth_eval_access set full_name = r->>'name', job_title = r->>'jobTitle',
        department_id = r->>'departmentId', department_name = r->>'departmentName', updated_at = now()
       where employee_id = r->>'employeeId' and (full_name is distinct from r->>'name' or job_title is distinct from r->>'jobTitle'
          or department_id is distinct from r->>'departmentId' or department_name is distinct from r->>'departmentName');
      if found then v_updated := v_updated + 1; end if;
    else
      insert into public.manafeth_eval_access(employee_id, full_name, job_title, department_id, department_name, role_key, view_scope, can_evaluate, can_manage, updated_by)
      values (r->>'employeeId', r->>'name', r->>'jobTitle', r->>'departmentId', r->>'departmentName', v_role, v_scope,
        v_role in ('club_director','dept_head'), false, v_me.full_name);
      v_added := v_added + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'added', v_added, 'updated', v_updated);
end $$;

create or replace function public.manafeth_eval_admin_audit(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me public.manafeth_eval_access;
begin
  v_me := public._eval_me(p_token);
  if not v_me.can_manage then raise exception 'متاح لمدير النظام فقط.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', a.id, 'createdAt', a.created_at, 'actorName', a.actor_name, 'actionType', a.action_type, 'entityType', a.entity_type,
    'entityId', a.entity_id, 'entityTitle', a.entity_title, 'summary', a.summary, 'reason', a.reason) order by a.created_at desc)
    from (select * from public.manafeth_eval_audit order by created_at desc limit 400) a), '[]'::jsonb);
end $$;

-- ---------- 6) Grants: only the public RPCs are callable by clients ----------
grant execute on function public.manafeth_issue_session(text, text) to anon, authenticated;
grant execute on function public.manafeth_revoke_session(text) to anon, authenticated;
grant execute on function public.manafeth_eval_me(text) to anon, authenticated;
grant execute on function public.manafeth_eval_get_criteria(text) to anon, authenticated;
grant execute on function public.manafeth_eval_get_settings(text) to anon, authenticated;
grant execute on function public.manafeth_eval_submit(text, jsonb) to anon, authenticated;
grant execute on function public.manafeth_eval_list(text, jsonb) to anon, authenticated;
grant execute on function public.manafeth_eval_delete(text, text, text) to anon, authenticated;
grant execute on function public.manafeth_eval_restore(text, text) to anon, authenticated;
grant execute on function public.manafeth_eval_save_criterion(text, jsonb) to anon, authenticated;
grant execute on function public.manafeth_eval_delete_criterion(text, text) to anon, authenticated;
grant execute on function public.manafeth_eval_save_setting(text, text, jsonb) to anon, authenticated;
grant execute on function public.manafeth_eval_admin_get_access(text) to anon, authenticated;
grant execute on function public.manafeth_eval_admin_set_access(text, text, jsonb) to anon, authenticated;
grant execute on function public.manafeth_eval_admin_sync_directory(text, jsonb) to anon, authenticated;
grant execute on function public.manafeth_eval_admin_audit(text) to anon, authenticated;

-- Hard-lock the tables from direct API access (RLS has no policies; revoke as defense in depth)
revoke all on public.manafeth_ops_sessions, public.manafeth_eval_access, public.manafeth_eval_criteria,
  public.manafeth_eval_settings, public.manafeth_evaluations, public.manafeth_eval_audit from anon, authenticated;
