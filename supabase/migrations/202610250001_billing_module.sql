-- GD Singh PMS billing module - initial integration
-- Apply after the existing 202610210001 through 202610240001 migrations.
-- This migration adds billing tables, registration settings, HSN/SAC, GST calculation,
-- completed-task billing protection, and a server-side atomic invoice creation function.

create table if not exists public.firm_gst_registrations (
  id uuid primary key default gen_random_uuid(),
  registration_name text not null,
  legal_name text not null default 'GD Singh & Associates',
  gstin text,
  address_line1 text,
  address_line2 text,
  city text,
  state_name text not null,
  state_code text not null,
  pincode text,
  invoice_prefix text not null default 'GDS',
  is_active boolean not null default false,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint firm_gst_registrations_state_code_chk check (state_code ~ '^[0-9]{2}$')
);

create unique index if not exists firm_gst_registrations_gstin_unique
  on public.firm_gst_registrations(gstin) where gstin is not null and trim(gstin) <> '';
create unique index if not exists firm_gst_registrations_one_default
  on public.firm_gst_registrations(is_default) where is_default = true;

alter table public.clients
  add column if not exists billing_address_line1 text,
  add column if not exists billing_address_line2 text,
  add column if not exists billing_city text,
  add column if not exists billing_state text,
  add column if not exists billing_state_code text,
  add column if not exists billing_pincode text,
  add column if not exists recipient_type text not null default 'business'
    check (recipient_type in ('business','unregistered','consumer','government','sez'));

create table if not exists public.billing_service_rates (
  id uuid primary key default gen_random_uuid(),
  service_name text not null,
  task_category text not null default 'Other',
  description text not null default '',
  sac_code text,
  hsn_code text,
  supply_type text not null default 'service' check (supply_type in ('service','goods')),
  default_fee numeric(14,2) not null default 0 check (default_fee >= 0),
  gst_rate numeric(5,2) not null default 18 check (gst_rate >= 0 and gst_rate <= 100),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists billing_service_rates_category_idx
  on public.billing_service_rates(task_category, active);

create table if not exists public.billing_invoice_sequences (
  registration_id uuid not null references public.firm_gst_registrations(id) on delete restrict,
  financial_year text not null,
  last_number integer not null default 0,
  primary key (registration_id, financial_year)
);

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  registration_id uuid not null references public.firm_gst_registrations(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  invoice_date date not null default current_date,
  due_date date,
  place_of_supply_state text not null,
  place_of_supply_code text not null,
  supply_type text not null check (supply_type in ('intra_state','inter_state')),
  reverse_charge boolean not null default false,
  status text not null default 'issued' check (status in ('draft','issued','cancelled')),
  currency text not null default 'INR' check (currency = 'INR'),
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  taxable_value numeric(14,2) not null default 0,
  cgst_total numeric(14,2) not null default 0,
  sgst_total numeric(14,2) not null default 0,
  igst_total numeric(14,2) not null default 0,
  total_tax numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null
);
create index if not exists billing_invoices_client_date_idx
  on public.billing_invoices(client_id, invoice_date desc);
create index if not exists billing_invoices_status_idx
  on public.billing_invoices(status, invoice_date desc);

create table if not exists public.billing_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.billing_invoices(id) on delete restrict,
  task_id uuid references public.tasks(id) on delete restrict,
  line_type text not null check (line_type in ('service','expense','goods')),
  description text not null,
  hsn_code text,
  sac_code text,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_rate numeric(14,2) not null default 0 check (unit_rate >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  taxable_value numeric(14,2) not null default 0,
  gst_rate numeric(5,2) not null default 0 check (gst_rate >= 0 and gst_rate <= 100),
  tax_treatment text not null default 'taxable' check (tax_treatment in ('taxable','non_taxable')),
  cgst_amount numeric(14,2) not null default 0,
  sgst_amount numeric(14,2) not null default 0,
  igst_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  expense_date date,
  receipt_reference text,
  pure_agent_claimed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint billing_invoice_line_discount_chk check (discount_amount <= quantity * unit_rate)
);
create index if not exists billing_invoice_lines_invoice_idx on public.billing_invoice_lines(invoice_id);
create index if not exists billing_invoice_lines_task_idx on public.billing_invoice_lines(task_id) where task_id is not null;

create or replace function public.billing_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists billing_registrations_updated_at on public.firm_gst_registrations;
create trigger billing_registrations_updated_at before update on public.firm_gst_registrations
for each row execute function public.billing_set_updated_at();
drop trigger if exists billing_rates_updated_at on public.billing_service_rates;
create trigger billing_rates_updated_at before update on public.billing_service_rates
for each row execute function public.billing_set_updated_at();
drop trigger if exists billing_invoices_updated_at on public.billing_invoices;
create trigger billing_invoices_updated_at before update on public.billing_invoices
for each row execute function public.billing_set_updated_at();

alter table public.firm_gst_registrations enable row level security;
alter table public.billing_service_rates enable row level security;
alter table public.billing_invoice_sequences enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_invoice_lines enable row level security;

drop policy if exists "billing_registrations_read_management" on public.firm_gst_registrations;
create policy "billing_registrations_read_management" on public.firm_gst_registrations
for select to authenticated using (public.current_role() in ('partner','manager'));
drop policy if exists "billing_registrations_manage_partner" on public.firm_gst_registrations;
create policy "billing_registrations_manage_partner" on public.firm_gst_registrations
for all to authenticated using (public.current_role() = 'partner')
with check (public.current_role() = 'partner');

drop policy if exists "billing_rates_read_management" on public.billing_service_rates;
create policy "billing_rates_read_management" on public.billing_service_rates
for select to authenticated using (public.current_role() in ('partner','manager'));
drop policy if exists "billing_rates_manage_management" on public.billing_service_rates;
create policy "billing_rates_manage_management" on public.billing_service_rates
for all to authenticated using (public.current_role() in ('partner','manager'))
with check (public.current_role() in ('partner','manager'));

drop policy if exists "billing_invoices_read_management" on public.billing_invoices;
create policy "billing_invoices_read_management" on public.billing_invoices
for select to authenticated using (public.current_role() in ('partner','manager'));
drop policy if exists "billing_lines_read_management" on public.billing_invoice_lines;
create policy "billing_lines_read_management" on public.billing_invoice_lines
for select to authenticated using (public.current_role() in ('partner','manager'));

-- Atomic invoice creation: validates task eligibility, applies GST according to
-- supplier registration state versus place-of-supply state, and assigns FY numbering.
create or replace function public.create_billing_invoice(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
  v_user uuid := auth.uid();
  v_registration public.firm_gst_registrations%rowtype;
  v_client public.clients%rowtype;
  v_invoice_id uuid := gen_random_uuid();
  v_invoice_date date;
  v_due_date date;
  v_pos_state text;
  v_pos_code text;
  v_supply_type text;
  v_fy_start integer;
  v_fy text;
  v_seq integer;
  v_invoice_number text;
  v_line jsonb;
  v_task_id uuid;
  v_quantity numeric(12,3);
  v_rate numeric(14,2);
  v_discount numeric(14,2);
  v_base numeric(14,2);
  v_gst_rate numeric(5,2);
  v_cgst numeric(14,2);
  v_sgst numeric(14,2);
  v_igst numeric(14,2);
  v_total numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_discount_total numeric(14,2) := 0;
  v_taxable numeric(14,2) := 0;
  v_cgst_total numeric(14,2) := 0;
  v_sgst_total numeric(14,2) := 0;
  v_igst_total numeric(14,2) := 0;
  v_line_count integer := 0;
  v_treatment text;
begin
  select role into v_role from public.profiles where id = v_user and active = true;
  if v_role is null or v_role not in ('partner','manager') then
    raise exception 'Only an active Partner or Manager can create invoices';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Select at least one task or expense line';
  end if;

  select * into v_registration from public.firm_gst_registrations
    where id = (p_header->>'registration_id')::uuid and is_active = true;
  if not found then raise exception 'Select an active supplier GST registration'; end if;

  select * into v_client from public.clients
    where id = (p_header->>'client_id')::uuid and status = 'active';
  if not found then raise exception 'Select an active client'; end if;

  v_invoice_date := coalesce(nullif(p_header->>'invoice_date','')::date, current_date);
  v_due_date := nullif(p_header->>'due_date','')::date;
  v_pos_state := nullif(trim(p_header->>'place_of_supply_state'),'');
  v_pos_code := nullif(trim(p_header->>'place_of_supply_code'),'');
  if v_pos_state is null or v_pos_code is null or v_pos_code !~ '^[0-9]{2}$' then
    raise exception 'Enter a valid place of supply state and state code';
  end if;
  v_supply_type := case when v_registration.state_code = v_pos_code then 'intra_state' else 'inter_state' end;
  v_fy_start := case when extract(month from v_invoice_date) >= 4 then extract(year from v_invoice_date)::integer else extract(year from v_invoice_date)::integer - 1 end;
  v_fy := v_fy_start::text || '-' || right((v_fy_start + 1)::text,2);

  insert into public.billing_invoice_sequences(registration_id,financial_year,last_number)
    values(v_registration.id,v_fy,1)
    on conflict (registration_id,financial_year)
    do update set last_number = public.billing_invoice_sequences.last_number + 1
    returning last_number into v_seq;
  v_invoice_number := coalesce(nullif(v_registration.invoice_prefix,''),'GDS') || '/' || v_fy || '/' || lpad(v_seq::text,4,'0');

  insert into public.billing_invoices(
    id,invoice_number,registration_id,client_id,invoice_date,due_date,
    place_of_supply_state,place_of_supply_code,supply_type,reverse_charge,status,
    notes,created_by
  ) values (
    v_invoice_id,v_invoice_number,v_registration.id,v_client.id,v_invoice_date,v_due_date,
    v_pos_state,v_pos_code,v_supply_type,coalesce((p_header->>'reverse_charge')::boolean,false),
    'issued',nullif(p_header->>'notes',''),v_user
  );

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_count := v_line_count + 1;
    if nullif(trim(v_line->>'description'),'') is null then raise exception 'Every invoice line needs a description'; end if;
    v_task_id := nullif(v_line->>'task_id','')::uuid;
    v_quantity := coalesce(nullif(v_line->>'quantity','')::numeric,1);
    v_rate := coalesce(nullif(v_line->>'unit_rate','')::numeric,0);
    v_discount := coalesce(nullif(v_line->>'discount_amount','')::numeric,0);
    v_gst_rate := coalesce(nullif(v_line->>'gst_rate','')::numeric,0);
    v_treatment := coalesce(nullif(v_line->>'tax_treatment',''),'taxable');
    if v_quantity <= 0 or v_rate < 0 or v_discount < 0 or v_discount > v_quantity*v_rate then
      raise exception 'Invalid quantity, rate or discount on invoice line';
    end if;
    if v_gst_rate < 0 or v_gst_rate > 100 then raise exception 'Invalid GST rate'; end if;
    if v_task_id is not null then
      perform pg_advisory_xact_lock(hashtext(v_task_id::text));
      if not exists(select 1 from public.tasks where id=v_task_id and client_id=v_client.id and status='completed') then
        raise exception 'Only completed tasks belonging to the selected client can be billed';
      end if;
      if exists(
        select 1 from public.billing_invoice_lines l
        join public.billing_invoices i on i.id=l.invoice_id
        where l.task_id=v_task_id and i.status in ('draft','issued')
      ) then raise exception 'A selected task is already included in an active invoice'; end if;
    end if;
    if v_treatment not in ('taxable','non_taxable') then raise exception 'Invalid tax treatment'; end if;
    v_base := round((v_quantity*v_rate-v_discount),2);
    if v_treatment = 'non_taxable' then v_gst_rate := 0; end if;
    v_cgst := 0; v_sgst := 0; v_igst := 0;
    if v_supply_type = 'intra_state' then
      v_cgst := round(v_base*v_gst_rate/200,2);
      v_sgst := round(v_base*v_gst_rate/200,2);
    else
      v_igst := round(v_base*v_gst_rate/100,2);
    end if;
    v_total := v_base + v_cgst + v_sgst + v_igst;

    insert into public.billing_invoice_lines(
      invoice_id,task_id,line_type,description,hsn_code,sac_code,quantity,unit_rate,
      discount_amount,taxable_value,gst_rate,tax_treatment,cgst_amount,sgst_amount,
      igst_amount,line_total,expense_date,receipt_reference,pure_agent_claimed
    ) values (
      v_invoice_id,v_task_id,coalesce(v_line->>'line_type','service'),trim(v_line->>'description'),
      nullif(trim(v_line->>'hsn_code'),''),nullif(trim(v_line->>'sac_code'),''),
      v_quantity,v_rate,v_discount,v_base,v_gst_rate,v_treatment,v_cgst,v_sgst,v_igst,v_total,
      nullif(v_line->>'expense_date','')::date,nullif(trim(v_line->>'receipt_reference'),''),
      coalesce((v_line->>'pure_agent_claimed')::boolean,false)
    );
    v_subtotal := v_subtotal + v_quantity*v_rate;
    v_discount_total := v_discount_total + v_discount;
    v_taxable := v_taxable + v_base;
    v_cgst_total := v_cgst_total + v_cgst;
    v_sgst_total := v_sgst_total + v_sgst;
    v_igst_total := v_igst_total + v_igst;
  end loop;

  update public.billing_invoices set
    subtotal=round(v_subtotal,2), discount_total=round(v_discount_total,2),
    taxable_value=round(v_taxable,2), cgst_total=round(v_cgst_total,2),
    sgst_total=round(v_sgst_total,2), igst_total=round(v_igst_total,2),
    total_tax=round(v_cgst_total+v_sgst_total+v_igst_total,2),
    grand_total=round(v_taxable+v_cgst_total+v_sgst_total+v_igst_total,2)
  where id=v_invoice_id;
  return v_invoice_id;
end;
$$;

revoke all on function public.create_billing_invoice(jsonb,jsonb) from public;
grant execute on function public.create_billing_invoice(jsonb,jsonb) to authenticated;

create or replace function public.cancel_billing_invoice(p_invoice_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if public.current_role() is null or public.current_role() not in ('partner','manager') then
    raise exception 'Only an active Partner or Manager can cancel invoices';
  end if;
  update public.billing_invoices
    set status='cancelled', cancelled_at=now(), cancelled_by=auth.uid()
    where id=p_invoice_id and status='issued';
  if not found then raise exception 'Invoice not found or already cancelled'; end if;
end;
$$;
revoke all on function public.cancel_billing_invoice(uuid) from public;
grant execute on function public.cancel_billing_invoice(uuid) to authenticated;

-- Seed one inactive Haryana registration placeholder. A Partner must enter the actual GSTIN
-- and activate it before issuing invoices. Delhi can be added later as a second registration.
insert into public.firm_gst_registrations(
  registration_name, legal_name, state_name, state_code, invoice_prefix, is_active, is_default
)
select 'Haryana GST Registration', 'GD Singh & Associates', 'Haryana', '06', 'GDS-HR', false, false
where not exists(select 1 from public.firm_gst_registrations where state_code='06');
