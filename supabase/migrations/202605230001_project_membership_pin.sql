alter table public.project_memberships
add column if not exists pinned_at timestamptz;

create index if not exists project_memberships_user_pinned_idx
on public.project_memberships (user_id, pinned_at desc nulls last);
