alter table public.project_tasks
add column if not exists linked_task_ids jsonb not null default '[]'::jsonb;
