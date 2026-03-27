alter table public.project_tasks
add column if not exists assigned_to uuid references auth.users (id) on delete set null;

create index if not exists project_tasks_project_assigned_to_idx
on public.project_tasks (project_id, assigned_to);
