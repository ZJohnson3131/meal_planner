-- Run manually against the local database after creating two test users.
-- Expected result: authenticated users can only see rows in households where
-- they have a household_memberships row. Service-role access is not covered by
-- RLS and must never be exposed to browser code.

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
