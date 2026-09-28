-- Protect cross-record identity and currency in both adapters.
create function check_enrolment_jurisdiction() returns trigger language plpgsql as $$
declare learner_country text; course_country text;
begin
select jurisdiction into learner_country from learners where id=new.learner_id;
select jurisdiction into course_country from courses where id=new.course_id;
if learner_country is distinct from course_country then raise exception 'Learner and course jurisdiction must match';end if;
return new;
end $$;
create trigger enrolment_jurisdiction before insert or update on enrolments for each row execute function check_enrolment_jurisdiction();
create function check_invoice_currency() returns trigger language plpgsql as $$
declare expected text;
begin
select case c.jurisdiction when 'AU' then 'AUD' else 'NZD' end into expected from enrolments e join courses c on c.id=e.course_id where e.id=new.enrolment_id;
if new.currency is distinct from expected then raise exception 'Invoice currency does not match course jurisdiction';end if;
return new;
end $$;
create trigger invoice_currency before insert or update on invoices for each row execute function check_invoice_currency();
create or replace view attendance_summary as
select e.id,e.name as enrolment,l.name as learner,
count(a.id) as recorded_sessions,count(a.id) filter(where a.status='absent') as absences,
coalesce(sum(a.minutes),0) as attended_minutes,
(select count(*) from sessions s where s.course_id=e.course_id and s.session_on between e.start_on and least(e.end_on,current_date)) as scheduled_sessions
from enrolments e join learners l on l.id=e.learner_id
left join attendance a on a.enrolment_id=e.id and a.session_id in
(select s.id from sessions s where s.course_id=e.course_id and s.session_on between e.start_on and least(e.end_on,current_date))
group by e.id,l.name;
