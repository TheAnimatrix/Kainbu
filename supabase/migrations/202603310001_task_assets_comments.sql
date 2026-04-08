create table if not exists public.project_task_assets (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references public.projects (id) on delete cascade,
	task_id text not null,
	kind text not null check (kind in ('attachment', 'embed')),
	name text not null,
	mime_type text not null,
	size_bytes bigint not null default 0 check (size_bytes >= 0),
	storage_path text not null unique,
	uploaded_by_user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
	created_at timestamptz not null default timezone('utc', now()),
	constraint project_task_assets_task_fk
		foreign key (project_id, task_id)
		references public.project_tasks (project_id, id)
		on delete cascade
);

create table if not exists public.project_task_comments (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references public.projects (id) on delete cascade,
	task_id text not null,
	body text not null check (length(trim(body)) > 0),
	author_user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	constraint project_task_comments_task_fk
		foreign key (project_id, task_id)
		references public.project_tasks (project_id, id)
		on delete cascade
);

create index if not exists project_task_assets_task_created_idx
on public.project_task_assets (project_id, task_id, created_at desc);

create index if not exists project_task_comments_task_created_idx
on public.project_task_comments (project_id, task_id, created_at asc);

drop trigger if exists project_task_comments_set_updated_at on public.project_task_comments;
create trigger project_task_comments_set_updated_at
before update on public.project_task_comments
for each row
execute procedure public.set_current_timestamp_updated_at();

alter table public.project_task_assets enable row level security;
alter table public.project_task_comments enable row level security;

drop policy if exists "Members can read task assets" on public.project_task_assets;
create policy "Members can read task assets"
on public.project_task_assets
for select
to authenticated
using ((select private.current_user_is_project_member(project_task_assets.project_id)));

drop policy if exists "Members can insert task assets" on public.project_task_assets;
create policy "Members can insert task assets"
on public.project_task_assets
for insert
to authenticated
with check (
	(select private.current_user_is_project_member(project_task_assets.project_id))
	and uploaded_by_user_id = (select auth.uid())
);

drop policy if exists "Members can delete task assets" on public.project_task_assets;
create policy "Members can delete task assets"
on public.project_task_assets
for delete
to authenticated
using ((select private.current_user_is_project_member(project_task_assets.project_id)));

drop policy if exists "Members can read task comments" on public.project_task_comments;
create policy "Members can read task comments"
on public.project_task_comments
for select
to authenticated
using ((select private.current_user_is_project_member(project_task_comments.project_id)));

drop policy if exists "Members can insert task comments" on public.project_task_comments;
create policy "Members can insert task comments"
on public.project_task_comments
for insert
to authenticated
with check (
	(select private.current_user_is_project_member(project_task_comments.project_id))
	and author_user_id = (select auth.uid())
);

drop policy if exists "Members can update task comments" on public.project_task_comments;
create policy "Members can update task comments"
on public.project_task_comments
for update
to authenticated
using ((select private.current_user_is_project_member(project_task_comments.project_id)))
with check ((select private.current_user_is_project_member(project_task_comments.project_id)));

drop policy if exists "Members can delete task comments" on public.project_task_comments;
create policy "Members can delete task comments"
on public.project_task_comments
for delete
to authenticated
using ((select private.current_user_is_project_member(project_task_comments.project_id)));

insert into storage.buckets (
	id,
	name,
	public,
	file_size_limit
)
values (
	'task-assets',
	'task-assets',
	false,
	20971520
)
on conflict (id) do update
set
	public = excluded.public,
	file_size_limit = excluded.file_size_limit;

create or replace function private.current_user_can_access_task_asset_project(p_project_id text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
	select
		p_project_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
		and (select auth.uid()) is not null
		and (select private.current_user_is_project_member(p_project_id::uuid));
$$;

revoke all on function private.current_user_can_access_task_asset_project(text) from public;
grant execute on function private.current_user_can_access_task_asset_project(text) to authenticated;

drop policy if exists "Members can read task asset files" on storage.objects;
create policy "Members can read task asset files"
on storage.objects
for select
to authenticated
using (
	bucket_id = 'task-assets'
	and (storage.foldername(name))[1] = 'project'
	and (select private.current_user_can_access_task_asset_project((storage.foldername(name))[2]))
);

drop policy if exists "Members can upload task asset files" on storage.objects;
create policy "Members can upload task asset files"
on storage.objects
for insert
to authenticated
with check (
	bucket_id = 'task-assets'
	and (storage.foldername(name))[1] = 'project'
	and (select private.current_user_can_access_task_asset_project((storage.foldername(name))[2]))
);

drop policy if exists "Members can delete task asset files" on storage.objects;
create policy "Members can delete task asset files"
on storage.objects
for delete
to authenticated
using (
	bucket_id = 'task-assets'
	and (storage.foldername(name))[1] = 'project'
	and (select private.current_user_can_access_task_asset_project((storage.foldername(name))[2]))
);
