alter table public.profiles
add column if not exists background_theme jsonb not null default '{"kind":"gradient","id":"ember-haze"}'::jsonb;

alter table public.projects
add column if not exists background_theme jsonb;

insert into storage.buckets (
	id,
	name,
	public,
	file_size_limit,
	allowed_mime_types
)
values (
	'backgrounds',
	'backgrounds',
	false,
	6291456,
	array['image/png', 'image/jpeg', 'image/webp', 'image/avif']
)
on conflict (id) do update
set
	public = excluded.public,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.current_user_can_access_background_project(p_project_id text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
	select
		p_project_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
		and (select auth.uid()) is not null
		and exists (
			select 1
			from public.project_memberships membership
			where membership.project_id = p_project_id::uuid
				and membership.user_id = (select auth.uid())
		);
$$;

revoke all on function private.current_user_can_access_background_project(text) from public;
grant execute on function private.current_user_can_access_background_project(text) to authenticated;

drop policy if exists "Authenticated users can read background assets" on storage.objects;
create policy "Authenticated users can read background assets"
on storage.objects
for select
to authenticated
using (
	bucket_id = 'backgrounds'
	and (
		(
			(storage.foldername(name))[1] = 'user'
			and (storage.foldername(name))[2] = (select auth.uid())::text
		)
		or (
			(storage.foldername(name))[1] = 'project'
			and (select private.current_user_can_access_background_project((storage.foldername(name))[2]))
		)
	)
);

drop policy if exists "Authenticated users can upload background assets" on storage.objects;
create policy "Authenticated users can upload background assets"
on storage.objects
for insert
to authenticated
with check (
	bucket_id = 'backgrounds'
	and (
		(
			(storage.foldername(name))[1] = 'user'
			and (storage.foldername(name))[2] = (select auth.uid())::text
		)
		or (
			(storage.foldername(name))[1] = 'project'
			and (select private.current_user_can_access_background_project((storage.foldername(name))[2]))
		)
	)
);

drop policy if exists "Authenticated users can delete background assets" on storage.objects;
create policy "Authenticated users can delete background assets"
on storage.objects
for delete
to authenticated
using (
	bucket_id = 'backgrounds'
	and (
		(
			(storage.foldername(name))[1] = 'user'
			and (storage.foldername(name))[2] = (select auth.uid())::text
		)
		or (
			(storage.foldername(name))[1] = 'project'
			and (select private.current_user_can_access_background_project((storage.foldername(name))[2]))
		)
	)
);
