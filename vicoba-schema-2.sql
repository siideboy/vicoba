-- Run AFTER vicoba-schema.sql

create or replace function approve_loan(p_id bigint, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare l loans; bal numeric; pr numeric;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  select * into l from loans where id = p_id and status = 'pending' for update;
  if not found then raise exception 'Loan is not pending'; end if;
  if not p_ok then
    update loans set status='rejected', approved_by=auth.uid() where id=p_id;
    insert into notifications(user_id,body) values (l.member_id,'Your loan application was not approved.');
    return;
  end if;
  update loans set status='disbursed', approved_by=auth.uid(), disbursed_at=now() where id=p_id;
  bal := l.principal; pr := round(l.principal / l.months, 2);
  for i in 1..l.months loop
    insert into loan_schedule(loan_id,due_date,principal_due,interest_due)
    values (p_id, (current_date + (i || ' month')::interval)::date, pr, round(bal * l.rate_monthly / 100, 2));
    bal := bal - pr;
  end loop;
  insert into transactions(member_id,kind,amount,reference,status,loan_id,created_by)
  values (l.member_id,'loan_disbursement',l.principal,'LOAN-'||p_id,'posted',p_id,auth.uid());
  insert into notifications(user_id,body) values (l.member_id,'Your loan of TZS '||l.principal||' was approved.');
end $$;

create or replace function confirm_payment(p_id bigint, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t transactions;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  update transactions set status = case when p_ok then 'posted' else 'rejected' end::tx_status
  where id = p_id and status = 'pending' returning * into t;
  if found and t.member_id is not null then
    insert into notifications(user_id,body) values (t.member_id,
      case when p_ok then 'Payment '||t.reference||' of TZS '||t.amount||' was confirmed.'
           else 'Payment '||t.reference||' was rejected. Contact the accountant.' end);
  end if;
end $$;

-- Let members read their own notifications and staff read announcements authors' names
alter publication supabase_realtime add table loans;
