-- Run after lifecycle-preservation.setup + migration in a disposable database.
-- Snapshot the owner and unrelated function/role configuration before changing
-- this RPC's allowance. The test never invokes the production owner.
CREATE TEMP TABLE cancellation_timeout_before AS
SELECT p.oid, p.prosrc, p.proacl, p.proowner, p.prosecdef, p.proconfig
FROM pg_proc p
WHERE p.oid = 'public.record_booking_cancellation_notice_atomic(uuid,text,text,timestamptz,bigint,text,uuid)'::regprocedure;

CREATE TEMP TABLE cancellation_timeout_other_functions AS
SELECT p.oid, p.proconfig FROM pg_proc p
WHERE p.oid <> 'public.record_booking_cancellation_notice_atomic(uuid,text,text,timestamptz,bigint,text,uuid)'::regprocedure;

CREATE TEMP TABLE cancellation_timeout_roles AS
SELECT oid, rolconfig FROM pg_roles;
