-- Allow negative payment amounts so Boss advances can reduce BSP Excess Cash.
-- Safe to re-run.

alter table public.uk_square_payment_entries
  drop constraint if exists uk_square_payment_entries_amount_check;

alter table public.uk_square_payment_entries
  add constraint uk_square_payment_entries_amount_check
  check (amount <> 0);

-- Boss-only: post advance to Mr. D Kantha (W) or D KANTHA Cash, and lessen BSP.
create or replace function public.post_uk_square_advance(
  p_booking_sl_no integer,
  p_site_no text,
  p_destination text,
  p_entry_date date,
  p_amount numeric,
  p_note text default '',
  p_bsp_opening numeric default null,
  p_destination_opening numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dest_sl integer;
  v_bsp_sl integer;
  v_bsp_available numeric(14, 2);
  v_dest_opening numeric(14, 2);
  v_label text;
  v_has_bsp boolean;
  v_has_dest boolean;
begin
  if not public.is_boss() then
    raise exception 'Only Boss can post UK Square advances';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Advance amount must be greater than zero';
  end if;
  if p_destination not in ('d_kantha', 'd_kantha_cash') then
    raise exception 'Advance destination must be Mr. D Kantha (W) or D KANTHA Cash';
  end if;
  if p_entry_date is null then
    raise exception 'Date is required';
  end if;

  select exists (
    select 1
    from public.uk_square_payment_entries
    where booking_sl_no = p_booking_sl_no
      and category = 'bsp'
      and status = 'approved'
  ) into v_has_bsp;

  if v_has_bsp then
    select coalesce(sum(amount), 0)
      into v_bsp_available
    from public.uk_square_payment_entries
    where booking_sl_no = p_booking_sl_no
      and category = 'bsp'
      and status = 'approved';
  else
    select coalesce(bsp, p_bsp_opening, 0)
      into v_bsp_available
    from public.uk_square_bookings
    where sl_no = p_booking_sl_no;

    if not found then
      v_bsp_available := coalesce(p_bsp_opening, 0);
    end if;
  end if;

  if p_amount > v_bsp_available then
    raise exception 'Advance % exceeds available BSP Excess Cash %', p_amount, v_bsp_available;
  end if;

  v_label := case
    when p_destination = 'd_kantha' then 'Mr. D Kantha (W)'
    else 'D KANTHA Cash'
  end;

  perform set_config('app.uk_square_seed_insert', '1', true);

  -- Materialize opening BSP so the less line does not wipe the seed balance.
  if not v_has_bsp and v_bsp_available > 0 then
    insert into public.uk_square_payment_entries (
      booking_sl_no, site_no, category, entry_sl_no, entry_date, amount, note, status, created_by
    ) values (
      p_booking_sl_no,
      coalesce(p_site_no, ''),
      'bsp',
      1,
      p_entry_date,
      v_bsp_available,
      'Opening BSP Excess Cash',
      'approved',
      auth.uid()
    );
  end if;

  select exists (
    select 1
    from public.uk_square_payment_entries
    where booking_sl_no = p_booking_sl_no
      and category = p_destination
      and status = 'approved'
  ) into v_has_dest;

  if not v_has_dest then
    if p_destination = 'd_kantha' then
      select coalesce(mr_d_kantha, p_destination_opening, 0)
        into v_dest_opening
      from public.uk_square_bookings
      where sl_no = p_booking_sl_no;
      if not found then
        v_dest_opening := coalesce(p_destination_opening, 0);
      end if;
    else
      select coalesce(d_kantha, p_destination_opening, 0)
        into v_dest_opening
      from public.uk_square_bookings
      where sl_no = p_booking_sl_no;
      if not found then
        v_dest_opening := coalesce(p_destination_opening, 0);
      end if;
    end if;

    if v_dest_opening > 0 then
      insert into public.uk_square_payment_entries (
        booking_sl_no, site_no, category, entry_sl_no, entry_date, amount, note, status, created_by
      ) values (
        p_booking_sl_no,
        coalesce(p_site_no, ''),
        p_destination,
        1,
        p_entry_date,
        v_dest_opening,
        'Opening ' || v_label,
        'approved',
        auth.uid()
      );
    end if;
  end if;

  select coalesce(max(entry_sl_no), 0) + 1
    into v_dest_sl
  from public.uk_square_payment_entries
  where booking_sl_no = p_booking_sl_no
    and category = p_destination;

  select coalesce(max(entry_sl_no), 0) + 1
    into v_bsp_sl
  from public.uk_square_payment_entries
  where booking_sl_no = p_booking_sl_no
    and category = 'bsp';

  insert into public.uk_square_payment_entries (
    booking_sl_no, site_no, category, entry_sl_no, entry_date, amount, note, status, created_by
  ) values (
    p_booking_sl_no,
    coalesce(p_site_no, ''),
    p_destination,
    v_dest_sl,
    p_entry_date,
    p_amount,
    coalesce(nullif(trim(p_note), ''), 'Advance from BSP Excess Cash'),
    'approved',
    auth.uid()
  );

  insert into public.uk_square_payment_entries (
    booking_sl_no, site_no, category, entry_sl_no, entry_date, amount, note, status, created_by
  ) values (
    p_booking_sl_no,
    coalesce(p_site_no, ''),
    'bsp',
    v_bsp_sl,
    p_entry_date,
    -p_amount,
    coalesce(
      nullif(trim(p_note), ''),
      'Less: Advance to ' || v_label
    ),
    'approved',
    auth.uid()
  );

  perform public.sync_uk_square_booking_totals(p_booking_sl_no);
end;
$$;

revoke all on function public.post_uk_square_advance(integer, text, text, date, numeric, text, numeric, numeric) from public;
grant execute on function public.post_uk_square_advance(integer, text, text, date, numeric, text, numeric, numeric) to authenticated;
