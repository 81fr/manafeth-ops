-- =====================================================================
-- Manafeth v4.0 — security hardening + platform diagnostics
--  A) password hashing (bcrypt via pgcrypto) + login throttling
--  B) account management now REQUIRES an authenticated server session
--     (the old unauthenticated manafeth_upsert_account is revoked)
--  C) client error log, user problem reports, admin health overview
--  D) realtime publication for the shared operational state
-- Idempotent: safe to run more than once.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- A) hashed passwords ----------
-- one-time migration of any legacy plaintext secrets to bcrypt
update public.manafeth_ops_accounts
   set password_secret = extensions.crypt(password_secret, extensions.gen_salt('bf', 8))
 where password_secret is not null and password_secret not like '$2%';

create table if not exists public.manafeth_login_attempts (
  id        bigint generated always as identity primary key,
  username  text not null,
  at        timestamptz not null default now()
);
create index if not exists idx_manafeth_login_attempts on public.manafeth_login_attempts(username, at desc);
alter table public.manafeth_login_attempts enable row level security;
revoke all on public.manafeth_login_attempts from anon, authenticated;

create or replace function public.manafeth_verify_login(p_username text, p_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_acc public.manafeth_ops_accounts%rowtype;
  v_user text := lower(trim(coalesce(p_username, '')));
  v_fails int;
  v_ok boolean := false;
begin
  select count(*) into v_fails from public.manafeth_login_attempts
   where username = v_user and at > now() - interval '10 minutes';
  if v_fails >= 8 then
    return jsonb_build_object('ok', false, 'reason', 'locked',
      'message', 'تم إيقاف المحاولات مؤقتًا بسبب كثرة المحاولات الخاطئة. حاول مرة أخرى بعد 10 دقائق.');
  end if;

  select * into v_acc from public.manafeth_ops_accounts
   where lower(trim(username)) = v_user limit 1;

  if found then
    if v_acc.password_secret like '$2%' then
      v_ok := (v_acc.password_secret = extensions.crypt(coalesce(p_password, ''), v_acc.password_secret));
    else
      v_ok := (v_acc.password_secret = coalesce(p_password, ''));
    end if;
  end if;

  if not v_ok then
    insert into public.manafeth_login_attempts(username) values (v_user);
    delete from public.manafeth_login_attempts where at < now() - interval '1 day';
    return jsonb_build_object('ok', false, 'reason', 'invalid_credentials',
      'message', 'اسم المستخدم أو كلمة المرور غير صحيحة.');
  end if;

  if v_acc.account_status <> 'نشط' then
    return jsonb_build_object('ok', false, 'reason', 'disabled',
      'message', 'هذا الحساب غير نشط حاليًا. يرجى مراجعة مدير النظام.');
  end if;

  delete from public.manafeth_login_attempts where username = v_user;
  return jsonb_build_object('ok', true, 'employeeId', v_acc.employee_id,
    'username', v_acc.username, 'accountStatus', v_acc.account_status);
end $$;

-- ---------- B) authenticated account management ----------
-- Does the given employee hold a permission according to the shared state document?
create or replace function public._ops_emp_has_perm(p_employee_id text, p_perm text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_emp jsonb;
begin
  select e.v into v_emp
    from public.manafeth_ops_state s,
         jsonb_array_elements(coalesce(s.payload->'employees', '[]'::jsonb)) as e(v)
   where s.doc_key = 'ops_overlay_v1' and e.v->>'id' = p_employee_id limit 1;
  if v_emp is null then return false; end if;
  if coalesce(v_emp->>'role','') = 'full_admin' or coalesce(v_emp->>'adminLevel','') = 'full_admin' then
    return true;
  end if;
  return coalesce((v_emp->'permissions'->>p_perm)::boolean, false);
end $$;

create or replace function public._ops_emp_is_full_admin(p_employee_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_emp jsonb;
begin
  select e.v into v_emp
    from public.manafeth_ops_state s,
         jsonb_array_elements(coalesce(s.payload->'employees', '[]'::jsonb)) as e(v)
   where s.doc_key = 'ops_overlay_v1' and e.v->>'id' = p_employee_id limit 1;
  return coalesce(v_emp->>'role','') = 'full_admin' or coalesce(v_emp->>'adminLevel','') = 'full_admin';
end $$;

revoke execute on function public._ops_emp_has_perm(text, text) from public, anon, authenticated;
revoke execute on function public._ops_emp_is_full_admin(text) from public, anon, authenticated;

create or replace function public.manafeth_upsert_account(
  p_employee_id text,
  p_username text,
  p_password text default null,
  p_status text default 'نشط',
  p_actor text default 'system',
  p_token text default null
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me public.manafeth_eval_access;
  v_caller_name text := coalesce(p_actor, 'system');
  v_clean_user text := trim(coalesce(p_username, ''));
  v_existing public.manafeth_ops_accounts%rowtype;
  v_conflict text;
  v_is_admin boolean := true;
  v_pwd text;
begin
  if p_token is not null and trim(p_token) <> '' then
    v_me := public._eval_me(p_token);
    v_is_admin := v_me.can_manage or public._ops_emp_is_full_admin(v_me.employee_id);
    if not (v_is_admin
            or public._ops_emp_has_perm(v_me.employee_id, 'edit_employees')
            or public._ops_emp_has_perm(v_me.employee_id, 'create_employee')
            or public._ops_emp_has_perm(v_me.employee_id, 'manage_permissions')) then
      return jsonb_build_object('ok', false, 'message', 'ليست لديك صلاحية إدارة حسابات الموظفين.');
    end if;
    if (not v_is_admin) and public._ops_emp_is_full_admin(p_employee_id) then
      return jsonb_build_object('ok', false, 'message', 'لا يمكن تعديل حساب مدير النظام إلا من مدير النظام نفسه.');
    end if;
    v_caller_name := coalesce(v_me.full_name, v_me.employee_id);
  end if;

  if v_clean_user = '' then
    return jsonb_build_object('ok', false, 'message', 'اسم المستخدم مطلوب.');
  end if;
  if p_password is not null and trim(p_password) <> '' and length(p_password) < 4 then
    return jsonb_build_object('ok', false, 'message', 'كلمة المرور قصيرة جدًا.');
  end if;

  select employee_id into v_conflict from public.manafeth_ops_accounts
   where lower(username) = lower(v_clean_user) and employee_id <> p_employee_id limit 1;
  if v_conflict is not null then
    return jsonb_build_object('ok', false, 'message', 'اسم المستخدم مسجل مسبقًا لموظف آخر.');
  end if;

  select * into v_existing from public.manafeth_ops_accounts where employee_id = p_employee_id;
  if found then
    update public.manafeth_ops_accounts set
      username = v_clean_user,
      password_secret = case when p_password is not null and trim(p_password) <> ''
                             then extensions.crypt(p_password, extensions.gen_salt('bf', 8))
                             else v_existing.password_secret end,
      account_status = coalesce(p_status, v_existing.account_status),
      updated_by = v_caller_name, updated_at = now()
    where employee_id = p_employee_id;
  else
    v_pwd := case when p_password is not null and trim(p_password) <> '' then p_password else 'Traof@2026' end;
    insert into public.manafeth_ops_accounts(employee_id, username, password_secret, account_status, updated_by, updated_at)
    values (p_employee_id, v_clean_user, extensions.crypt(v_pwd, extensions.gen_salt('bf', 8)),
            coalesce(p_status, 'نشط'), v_caller_name, now());
  end if;

  if coalesce(p_status, 'نشط') <> 'نشط' then
    update public.manafeth_ops_sessions set revoked = true where employee_id = p_employee_id;
  end if;
  return jsonb_build_object('ok', true, 'employeeId', p_employee_id, 'username', v_clean_user,
                            'accountStatus', coalesce(p_status, 'نشط'));
end $$;

drop function if exists public.manafeth_upsert_account(text, text, text, text, text);
grant execute on function public.manafeth_upsert_account(text, text, text, text, text, text) to anon, authenticated;

-- direct table access to credentials is never needed by the client
revoke all on public.manafeth_ops_accounts from anon, authenticated;

-- ---------- C) diagnostics ----------
create table if not exists public.manafeth_diag_events (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  kind          text not null,
  route         text,
  message       text,
  stack         text,
  component     text,
  employee_id   text,
  role_key      text,
  verified      boolean not null default false,
  app_version   text,
  user_agent    text,
  viewport      text,
  occurrences   int not null default 1
);
create index if not exists idx_manafeth_diag_events_at on public.manafeth_diag_events(created_at desc);
create index if not exists idx_manafeth_diag_events_kind on public.manafeth_diag_events(kind, route);
alter table public.manafeth_diag_events enable row level security;
revoke all on public.manafeth_diag_events from anon, authenticated;

create table if not exists public.manafeth_diag_reports (
  id            text primary key default ('RPT-' || replace(gen_random_uuid()::text, '-', '')),
  created_at    timestamptz not null default now(),
  employee_id   text not null,
  reporter_name text,
  role_key      text,
  route         text,
  category      text not null default 'other',
  description   text not null,
  user_agent    text,
  viewport      text,
  status        text not null default 'جديد' check (status in ('جديد','قيد المعالجة','تم الحل','مرفوض')),
  admin_note    text,
  resolved_by   text,
  resolved_at   timestamptz
);
create index if not exists idx_manafeth_diag_reports_at on public.manafeth_diag_reports(created_at desc);
alter table public.manafeth_diag_reports enable row level security;
revoke all on public.manafeth_diag_reports from anon, authenticated;

-- client error ingestion: anonymous allowed (errors can happen before login) but size/flood limited;
-- when a valid token is supplied the identity fields are taken from the server session.
create or replace function public.manafeth_diag_log(p_events jsonb, p_token text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_el jsonb; v_n int := 0; v_emp text := null; v_role text := null; v_verified boolean := false;
  v_me public.manafeth_eval_access;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    return jsonb_build_object('ok', false);
  end if;
  if (select count(*) from public.manafeth_diag_events where created_at > now() - interval '10 minutes') > 600 then
    return jsonb_build_object('ok', false, 'throttled', true);
  end if;
  if p_token is not null then
    begin
      v_me := public._eval_me(p_token);
      v_emp := v_me.employee_id; v_role := v_me.role_key; v_verified := true;
    exception when others then v_emp := null;
    end;
  end if;
  for v_el in select * from jsonb_array_elements(p_events) loop
    exit when v_n >= 20;
    insert into public.manafeth_diag_events(kind, route, message, stack, component, employee_id, role_key, verified,
                                            app_version, user_agent, viewport, occurrences)
    values (left(coalesce(v_el->>'kind','error'), 40), left(v_el->>'route', 80), left(v_el->>'message', 400),
            left(v_el->>'stack', 2500), left(v_el->>'component', 1200),
            coalesce(v_emp, left(v_el->>'employeeId', 40)), coalesce(v_role, left(v_el->>'role', 40)), v_verified,
            left(v_el->>'appVersion', 20), left(v_el->>'userAgent', 200), left(v_el->>'viewport', 20),
            greatest(1, least(coalesce((v_el->>'count')::int, 1), 1000)));
    v_n := v_n + 1;
  end loop;
  delete from public.manafeth_diag_events where created_at < now() - interval '45 days';
  return jsonb_build_object('ok', true, 'stored', v_n);
end $$;

create or replace function public.manafeth_diag_report(p_token text, p_report jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me public.manafeth_eval_access; v_desc text; v_id text;
begin
  v_me := public._eval_me(p_token);
  v_desc := trim(coalesce(p_report->>'description', ''));
  if length(v_desc) < 5 then
    return jsonb_build_object('ok', false, 'message', 'يرجى وصف المشكلة بجملة واضحة (5 أحرف على الأقل).');
  end if;
  if (select count(*) from public.manafeth_diag_reports
       where employee_id = v_me.employee_id and created_at > now() - interval '10 minutes') >= 10 then
    return jsonb_build_object('ok', false, 'message', 'تم إرسال عدد كبير من البلاغات خلال وقت قصير. حاول لاحقًا.');
  end if;
  insert into public.manafeth_diag_reports(employee_id, reporter_name, role_key, route, category, description, user_agent, viewport)
  values (v_me.employee_id, v_me.full_name, v_me.role_key, left(p_report->>'route', 80),
          case when (p_report->>'category') in ('page_error','wrong_data','cannot_save','permissions','slow','other')
               then p_report->>'category' else 'other' end,
          left(v_desc, 1500), left(p_report->>'userAgent', 200), left(p_report->>'viewport', 20))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.manafeth_diag_admin_overview(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me public.manafeth_eval_access; v_state_updated timestamptz;
begin
  v_me := public._eval_me(p_token);
  if not v_me.can_manage then raise exception 'متاح لمدير النظام فقط.'; end if;
  select updated_at into v_state_updated from public.manafeth_ops_state where doc_key = 'ops_overlay_v1';
  return jsonb_build_object(
    'serverTime', now(),
    'stateUpdatedAt', v_state_updated,
    'counts', jsonb_build_object(
      'accounts', (select count(*) from public.manafeth_ops_accounts),
      'activeSessions', (select count(*) from public.manafeth_ops_sessions where revoked = false and expires_at > now()),
      'evaluations', (select count(*) from public.manafeth_evaluations where is_deleted = false),
      'events24h', (select count(*) from public.manafeth_diag_events where created_at > now() - interval '24 hours'),
      'events7d', (select count(*) from public.manafeth_diag_events where created_at > now() - interval '7 days'),
      'openReports', (select count(*) from public.manafeth_diag_reports where status in ('جديد','قيد المعالجة'))),
    'byKind', coalesce((select jsonb_agg(jsonb_build_object('kind', k.kind, 'n', k.n, 'last', k.last))
        from (select kind, sum(occurrences)::int n, max(created_at) last from public.manafeth_diag_events
               where created_at > now() - interval '7 days' group by kind order by 2 desc) k), '[]'::jsonb),
    'failingRoutes', coalesce((select jsonb_agg(jsonb_build_object('route', r.route, 'n', r.n, 'last', r.last))
        from (select route, sum(occurrences)::int n, max(created_at) last from public.manafeth_diag_events
               where kind in ('render_error','chunk_load') and created_at > now() - interval '7 days'
               group by route having sum(occurrences) >= 1 order by 2 desc limit 20) r), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'createdAt', e.created_at, 'kind', e.kind,
        'route', e.route, 'message', e.message, 'stack', e.stack, 'component', e.component, 'employeeId', e.employee_id,
        'role', e.role_key, 'verified', e.verified, 'appVersion', e.app_version, 'userAgent', e.user_agent,
        'viewport', e.viewport, 'occurrences', e.occurrences) order by e.created_at desc)
        from (select * from public.manafeth_diag_events order by created_at desc limit 300) e), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'createdAt', p.created_at, 'employeeId', p.employee_id,
        'reporterName', p.reporter_name, 'role', p.role_key, 'route', p.route, 'category', p.category,
        'description', p.description, 'viewport', p.viewport, 'status', p.status, 'adminNote', p.admin_note,
        'resolvedAt', p.resolved_at) order by p.created_at desc)
        from (select * from public.manafeth_diag_reports order by created_at desc limit 200) p), '[]'::jsonb)
  );
end $$;

create or replace function public.manafeth_diag_admin_update_report(p_token text, p_id text, p_status text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me public.manafeth_eval_access;
begin
  v_me := public._eval_me(p_token);
  if not v_me.can_manage then raise exception 'متاح لمدير النظام فقط.'; end if;
  if p_status not in ('جديد','قيد المعالجة','تم الحل','مرفوض') then
    return jsonb_build_object('ok', false, 'message', 'حالة غير صالحة.');
  end if;
  update public.manafeth_diag_reports set status = p_status, admin_note = coalesce(p_note, admin_note),
         resolved_by = case when p_status in ('تم الحل','مرفوض') then v_me.full_name else null end,
         resolved_at = case when p_status in ('تم الحل','مرفوض') then now() else null end
   where id = p_id;
  return jsonb_build_object('ok', found);
end $$;

grant execute on function public.manafeth_diag_log(jsonb, text) to anon, authenticated;
grant execute on function public.manafeth_diag_report(text, jsonb) to anon, authenticated;
grant execute on function public.manafeth_diag_admin_overview(text) to anon, authenticated;
grant execute on function public.manafeth_diag_admin_update_report(text, text, text, text) to anon, authenticated;

-- ---------- D) realtime for the shared operational state ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.manafeth_ops_state; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.manafeth_ops_audit_logs; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.manafeth_ops_notifications; exception when duplicate_object then null; end;
  end if;
end $$;
