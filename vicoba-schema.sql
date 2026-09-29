-- THE BILLIONAIRE VICOBA: Supabase schema. Run once in SQL Editor.

create type app_role as enum ('member','accountant','secretary','chairman','admin');
create type tx_kind as enum ('shares','savings','loan_disbursement','loan_repayment','penalty','income','expense');
create type tx_status as enum ('pending','posted','rejected');
create type loan_status as enum ('pending','approved','disbursed','repaid','rejected');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  phone text,
  role app_role not null default 'member',
  active boolean not null default true,
  created_at timestamptz default now()
);

create table settings (
  id int primary key default 1 check (id = 1),
  share_price numeric not null default 50000,
  loan_rate_monthly numeric not null default 5,
  penalty_daily_pct numeric not null default 0.1,
  max_loan_multiple numeric not null default 3
);
insert into settings default values;

create table transactions (
  id bigint generated always as identity primary key,
  member_id uuid references profiles(id),
  kind tx_kind not null,
  amount numeric not null check (amount > 0),
  network text,
  reference text unique,               -- blocks duplicate SMS payments
  paid_at timestamptz default now(),
  raw_sms text,
  status tx_status not null default 'pending',
  loan_id bigint,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table loans (
  id bigint generated always as identity primary key,
  member_id uuid not null references profiles(id),
  principal numeric not null check (principal > 0),
  rate_monthly numeric not null,
  months int not null check (months between 1 and 36),
  status loan_status not null default 'pending',
  approved_by uuid references profiles(id),
  disbursed_at timestamptz,
  created_at timestamptz default now()
);

create table loan_schedule (
  id bigint generated always as identity primary key,
  loan_id bigint not null references loans(id) on delete cascade,
  due_date date not null,
  principal_due numeric not null,
  interest_due numeric not null,
  paid numeric not null default 0
);

create table announcements (
  id bigint generated always as identity primary key,
  title text not null, body text not null,
  created_by uuid references profiles(id), created_at timestamptz default now()
);

create table notifications (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id) on delete cascade,
  channel text not null default 'in_app',
  body text not null, read boolean default false, created_at timestamptz default now()
);

create table audit_logs (
  id bigint generated always as identity primary key,
  actor uuid, action text, table_name text, row_id text, detail jsonb,
  created_at timestamptz default now()
);

-- Helpers
create function my_role() returns app_role language sql stable security definer set search_path = public
as $$ select role from profiles where id = auth.uid() $$;

create function is_staff() returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(my_role() in ('accountant','chairman','admin'), false) $$;

-- New user -> profile (always 'member'; promote manually)
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into profiles (id, full_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.raw_user_meta_data->>'phone');
  return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Transparency: totals visible to every signed-in member
create function group_totals() returns json language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'shares',   coalesce(sum(amount) filter (where kind='shares'),0),
    'savings',  coalesce(sum(amount) filter (where kind='savings'),0),
    'disbursed',coalesce(sum(amount) filter (where kind='loan_disbursement'),0),
    'recovered',coalesce(sum(amount) filter (where kind='loan_repayment'),0),
    'income',   coalesce(sum(amount) filter (where kind in ('income','penalty')),0),
    'expenses', coalesce(sum(amount) filter (where kind='expense'),0)
  ) from transactions where status='posted' and auth.uid() is not null
$$;

-- Member submits a payment from pasted SMS (parsed in the app or Edge Function). Stays pending until staff confirm.
create function submit_payment(p_kind tx_kind, p_amount numeric, p_reference text, p_network text, p_raw text, p_paid_at timestamptz)
returns bigint language plpgsql security definer set search_path = public as $$
declare new_id bigint;
begin
  if p_kind not in ('shares','savings','loan_repayment') then raise exception 'Invalid kind'; end if;
  insert into transactions(member_id,kind,amount,reference,network,raw_sms,paid_at,status,created_by)
  values (auth.uid(),p_kind,p_amount,p_reference,p_network,p_raw,coalesce(p_paid_at,now()),'pending',auth.uid())
  returning id into new_id;
  return new_id;  -- unique(reference) raises an error on duplicates
end $$;

create function confirm_payment(p_id bigint, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  update transactions set status = case when p_ok then 'posted' else 'rejected' end::tx_status where id = p_id and status='pending';
end $$;

-- Audit trigger
create function audit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs(actor,action,table_name,row_id,detail)
  values (auth.uid(),tg_op,tg_table_name,coalesce(new.id,old.id)::text,to_jsonb(coalesce(new,old)));
  return coalesce(new,old); end $$;
create trigger audit_tx after insert or update or delete on transactions for each row execute function audit();
create trigger audit_loans after insert or update or delete on loans for each row execute function audit();
create trigger audit_profiles after update or delete on profiles for each row execute function audit();

-- Row Level Security
alter table profiles enable row level security;
alter table settings enable row level security;
alter table transactions enable row level security;
alter table loans enable row level security;
alter table loan_schedule enable row level security;
alter table announcements enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;

create policy "profiles read" on profiles for select using (id = auth.uid() or is_staff() or my_role()='secretary');
create policy "profiles self update" on profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = my_role());
create policy "profiles admin all" on profiles for all using (my_role()='admin') with check (my_role()='admin');

create policy "settings read" on settings for select using (auth.uid() is not null);
create policy "settings admin" on settings for update using (my_role()='admin');

create policy "tx own or staff read" on transactions for select using (member_id = auth.uid() or is_staff());
create policy "tx staff insert" on transactions for insert with check (is_staff());

create policy "loans own or staff read" on loans for select using (member_id = auth.uid() or is_staff() or my_role()='secretary');
create policy "loans member apply" on loans for insert with check (member_id = auth.uid() and status='pending');
create policy "loans staff update" on loans for update using (is_staff());

create policy "schedule read" on loan_schedule for select
  using (exists (select 1 from loans l where l.id = loan_id and (l.member_id = auth.uid() or is_staff())));

create policy "ann read" on announcements for select using (auth.uid() is not null);
create policy "ann write" on announcements for insert with check (my_role() in ('secretary','chairman','admin','accountant'));

create policy "notif own" on notifications for select using (user_id = auth.uid());
create policy "notif mark read" on notifications for update using (user_id = auth.uid());
create policy "notif staff send" on notifications for insert with check (is_staff() or my_role()='secretary');

create policy "audit admin read" on audit_logs for select using (my_role() in ('admin','chairman'));

-- Realtime for live dashboards
alter publication supabase_realtime add table transactions, announcements, notifications;

-- Per-member balances (respects RLS of the caller)
create view member_balances with (security_invoker = true) as
select p.id, p.full_name,
  coalesce(sum(t.amount) filter (where t.kind='shares'),0)  as shares,
  coalesce(sum(t.amount) filter (where t.kind='savings'),0) as savings
from profiles p left join transactions t on t.member_id = p.id and t.status='posted'
group by p.id, p.full_name;
