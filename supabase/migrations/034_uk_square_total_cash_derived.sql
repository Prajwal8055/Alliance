-- Total Cash (others) = D KANTHA Cash + BSP Excess Cash.
-- Cash must sit in those heads, not in total_cash payment lines.
-- Safe to re-run.

create or replace function public.sync_uk_square_booking_totals(p_booking_sl_no integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_as numeric(14, 2);
  v_kantha numeric(14, 2);
  v_kantha_cash numeric(14, 2);
  v_bsp numeric(14, 2);
  v_has_as boolean;
  v_has_kantha boolean;
  v_has_kantha_cash boolean;
  v_has_bsp boolean;
  v_cash numeric(14, 2);
begin
  select coalesce(sum(amount), 0), count(*) > 0
    into v_as, v_has_as
  from public.uk_square_payment_entries
  where booking_sl_no = p_booking_sl_no
    and category = 'as_booking'
    and status = 'approved';

  select coalesce(sum(amount), 0), count(*) > 0
    into v_kantha, v_has_kantha
  from public.uk_square_payment_entries
  where booking_sl_no = p_booking_sl_no
    and category = 'd_kantha'
    and status = 'approved';

  select coalesce(sum(amount), 0), count(*) > 0
    into v_kantha_cash, v_has_kantha_cash
  from public.uk_square_payment_entries
  where booking_sl_no = p_booking_sl_no
    and category = 'd_kantha_cash'
    and status = 'approved';

  select coalesce(sum(amount), 0), count(*) > 0
    into v_bsp, v_has_bsp
  from public.uk_square_payment_entries
  where booking_sl_no = p_booking_sl_no
    and category = 'bsp'
    and status = 'approved';

  -- Total Cash is derived — never from total_cash payment lines.
  if v_has_kantha_cash or v_has_bsp then
    v_cash := coalesce(v_kantha_cash, 0) + coalesce(v_bsp, 0);
  else
    v_cash := null;
  end if;

  update public.uk_square_bookings
  set
    to_as_booking = case when v_has_as then nullif(v_as, 0) else to_as_booking end,
    others = case
      when v_has_kantha_cash or v_has_bsp then nullif(v_cash, 0)
      else others
    end,
    mr_d_kantha = case when v_has_kantha then nullif(v_kantha, 0) else mr_d_kantha end,
    d_kantha = case when v_has_kantha_cash then nullif(v_kantha_cash, 0) else d_kantha end,
    bsp = case when v_has_bsp then nullif(v_bsp, 0) else bsp end,
    total = nullif(
      coalesce(
        case
          when v_has_kantha_cash or v_has_bsp then v_cash
          else others
        end,
        0
      )
      + coalesce(case when v_has_kantha then v_kantha else mr_d_kantha end, 0),
      0
    )
  where sl_no = p_booking_sl_no;
end;
$$;

revoke all on function public.sync_uk_square_booking_totals(integer) from public;
grant execute on function public.sync_uk_square_booking_totals(integer) to authenticated;
