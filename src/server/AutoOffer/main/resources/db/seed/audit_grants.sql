-- Run after adding ANY new table/function: lists objects nobody has been granted on
-- (rubric: "when adding new objects, check and update user permissions").
SELECT c.relname AS object, c.relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'autooffer' AND c.relkind IN ('r','v','m')
   AND (c.relacl IS NULL OR c.relacl::text !~ '(app_read|app_write|app_admin)');
