create function touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create table learners (id uuid primary key default gen_random_uuid(), source_id text unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), name text not null check(length(trim(name))>0), email text, birth_date date, jurisdiction text not null check(jurisdiction in ('AU','NZ')), usi text, usi_verified_on date, usi_evidence text, usi_exemption text, address text, citizenship text, nsn text);
create trigger touch_learners before update on learners for each row execute function touch_updated_at();
create table courses (id uuid primary key default gen_random_uuid(), source_id text unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), name text not null, code text not null unique, jurisdiction text not null check(jurisdiction in ('AU','NZ')), regulated boolean not null default true);
create trigger touch_courses before update on courses for each row execute function touch_updated_at();
create table units (id uuid primary key default gen_random_uuid(), source_id text unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), name text not null, code text not null unique, course_id uuid not null references courses(id));
create trigger touch_units before update on units for each row execute function touch_updated_at();
create table trainers (id uuid primary key default gen_random_uuid(), source_id text unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), name text not null, credential_ref text, reviewed_on date);
create trigger touch_trainers before update on trainers for each row execute function touch_updated_at();
create table enrolments (id uuid primary key default gen_random_uuid(), source_id text unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), name text not null, learner_id uuid not null references learners(id), course_id uuid not null references courses(id), trainer_id uuid references trainers(id), start_on date not null, end_on date not null, status text not null default 'active' check(status in ('active','completed','withdrawn')), completed_on date, last_contact_on date, requirements_confirmed boolean not null default false, requirements_ref text, fees_confirmed boolean not null default false, retention_until date, check(end_on>=start_on), check(completed_on is null or completed_on>=start_on), check(status<>'completed' or completed_on is not null));
create trigger touch_enrolments before update on enrolments for each row execute function touch_updated_at();
create table results (id uuid primary key default gen_random_uuid(), source_id text unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), name text not null, enrolment_id uuid not null references enrolments(id), unit_id uuid not null references units(id), outcome text not null check(outcome in ('pending','competent','not-yet-competent','credit-transfer','rpl')), due_on date, achieved_on date, evidence_ref text, retain_until date, unique(enrolment_id,unit_id), check(outcome not in ('competent','credit-transfer','rpl') or (achieved_on is not null and nullif(trim(evidence_ref),'') is not null)));
create trigger touch_results before update on results for each row execute function touch_updated_at();
create table sessions (id uuid primary key default gen_random_uuid(), source_id text unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), name text not null, course_id uuid not null references courses(id), trainer_id uuid references trainers(id), session_on date not null, minutes integer not null check(minutes>0), venue text);
create trigger touch_sessions before update on sessions for each row execute function touch_updated_at();
create table attendance (id uuid primary key default gen_random_uuid(), source_id text unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), name text not null, enrolment_id uuid not null references enrolments(id), session_id uuid not null references sessions(id), status text not null check(status in ('present','absent','excused')), minutes integer not null default 0 check(minutes>=0), unique(enrolment_id,session_id));
create trigger touch_attendance before update on attendance for each row execute function touch_updated_at();
create table invoices (id uuid primary key default gen_random_uuid(), source_id text unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), name text not null, enrolment_id uuid not null references enrolments(id), currency text not null check(currency in ('AUD','NZD')), amount_cents integer not null check(amount_cents>=0), paid_cents integer not null default 0 check(paid_cents>=0 and paid_cents<=amount_cents), due_on date not null, reference text);
create trigger touch_invoices before update on invoices for each row execute function touch_updated_at();
create table notes (id uuid primary key default gen_random_uuid(), source_id text unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), name text not null, enrolment_id uuid not null references enrolments(id), happened_on date not null, author text not null, body text not null);
create trigger touch_notes before update on notes for each row execute function touch_updated_at();
create table credentials (id uuid primary key default gen_random_uuid(), source_id text unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), name text not null unique, enrolment_id uuid not null unique references enrolments(id), issued_on date not null, document_ref text not null check(length(trim(document_ref))>0), authorised_by text not null check(length(trim(authorised_by))>0), retain_until date, permanent boolean not null default false);
create trigger touch_credentials before update on credentials for each row execute function touch_updated_at();

create table audit_log(id uuid primary key default gen_random_uuid(), entity text not null, record_id uuid not null, action text not null, before_record jsonb, after_record jsonb, created_at timestamptz not null default now());
create function audit_record() returns trigger language plpgsql as $$ begin insert into audit_log(entity,record_id,action,before_record,after_record) values(TG_TABLE_NAME,new.id,TG_OP,case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));return new;end $$;
create trigger audit_learners after insert or update on learners for each row execute function audit_record();
create trigger audit_courses after insert or update on courses for each row execute function audit_record();
create trigger audit_units after insert or update on units for each row execute function audit_record();
create trigger audit_trainers after insert or update on trainers for each row execute function audit_record();
create trigger audit_enrolments after insert or update on enrolments for each row execute function audit_record();
create trigger audit_results after insert or update on results for each row execute function audit_record();
create trigger audit_sessions after insert or update on sessions for each row execute function audit_record();
create trigger audit_attendance after insert or update on attendance for each row execute function audit_record();
create trigger audit_invoices after insert or update on invoices for each row execute function audit_record();
create trigger audit_notes after insert or update on notes for each row execute function audit_record();
create trigger audit_credentials after insert or update on credentials for each row execute function audit_record();

create function check_related_course() returns trigger language plpgsql as $$
declare course uuid; linked uuid; duration integer;
begin
 select course_id into course from enrolments where id=new.enrolment_id;
 if TG_TABLE_NAME='results' then select course_id into linked from units where id=new.unit_id;
 else select course_id,minutes into linked,duration from sessions where id=new.session_id;
 if new.minutes>duration then raise exception 'Attendance exceeds session duration'; end if;
 end if;
 if course is distinct from linked then raise exception 'Course mismatch'; end if;return new;
end $$;
create trigger results_course before insert or update on results for each row execute function check_related_course();
create trigger attendance_course before insert or update on attendance for each row execute function check_related_course();
create view enrolment_board as
select e.id,e.name,l.name as learner,c.name as course,c.jurisdiction,t.name as trainer,e.status,e.start_on,e.end_on,e.completed_on,
current_date-coalesce(e.last_contact_on,e.start_on) as quiet_days,
(select count(*) from units u where u.course_id=e.course_id) as required_units,
(select count(*) from results r where r.enrolment_id=e.id and r.outcome in ('competent','credit-transfer','rpl')) as passed_units,
(select count(*) from results r where r.enrolment_id=e.id and r.outcome in ('pending','not-yet-competent') and r.due_on<current_date) as overdue_results
from enrolments e join learners l on l.id=e.learner_id join courses c on c.id=e.course_id left join trainers t on t.id=e.trainer_id;
create view assessment_queue as
select r.id,e.name as enrolment,l.name as learner,u.code as unit,r.outcome,r.due_on,r.achieved_on,r.evidence_ref,t.name as trainer,current_date-r.due_on as days_overdue
from results r join enrolments e on e.id=r.enrolment_id join learners l on l.id=e.learner_id join units u on u.id=r.unit_id left join trainers t on t.id=e.trainer_id;
create view fee_balances as
select i.id,i.name as invoice,e.name as enrolment,l.name as learner,i.currency,i.amount_cents,i.paid_cents,i.amount_cents-i.paid_cents as balance_cents,i.due_on,current_date-i.due_on as days_overdue
from invoices i join enrolments e on e.id=i.enrolment_id join learners l on l.id=e.learner_id;
create view attendance_summary as
select e.id,e.name as enrolment,l.name as learner,
count(a.id) as recorded_sessions,count(a.id) filter(where a.status='absent') as absences,
coalesce(sum(a.minutes),0) as attended_minutes,
(select count(*) from sessions s where s.course_id=e.course_id and s.session_on between e.start_on and least(e.end_on,current_date)) as scheduled_sessions
from enrolments e join learners l on l.id=e.learner_id left join attendance a on a.enrolment_id=e.id group by e.id,l.name;
create view certificate_queue as
select b.*,e.completed_on+30 as review_due_on,e.requirements_confirmed,e.fees_confirmed,k.name as credential,
case when c.jurisdiction='AU' and c.regulated then (nullif(trim(l.usi_exemption),'') is not null or (l.usi_verified_on is not null and nullif(trim(l.usi_evidence),'') is not null and length(l.usi)=10)) else true end as identity_recorded
from enrolment_board b join enrolments e on e.id=b.id join courses c on c.id=e.course_id join learners l on l.id=e.learner_id left join credentials k on k.enrolment_id=e.id where e.status='completed';
create view retention_register as
select e.id,e.name as enrolment,c.jurisdiction,e.completed_on,e.retention_until as enrolment_retain_until,
case when c.jurisdiction='NZ' then 'permanent' else 'see credential register' end as academic_retention,
(e.completed_on+case when c.jurisdiction='AU' then interval '2 years' else interval '1 year' end)::date as assessment_floor,
k.name as credential,k.retain_until as credential_retain_until,k.permanent
from enrolments e join courses c on c.id=e.course_id left join credentials k on k.enrolment_id=e.id;
