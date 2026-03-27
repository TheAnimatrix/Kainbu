create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.current_user_is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
	select
		(select auth.uid()) is not null
		and exists (
			select 1
			from public.project_memberships membership
			where membership.project_id = p_project_id
				and membership.user_id = (select auth.uid())
		);
$$;

revoke all on function private.current_user_is_project_member(uuid) from public;
grant execute on function private.current_user_is_project_member(uuid) to authenticated;

create or replace function private.current_user_is_project_owner(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
	select
		(select auth.uid()) is not null
		and exists (
			select 1
			from public.projects project
			where project.id = p_project_id
				and project.user_id = (select auth.uid())
		);
$$;

revoke all on function private.current_user_is_project_owner(uuid) from public;
grant execute on function private.current_user_is_project_owner(uuid) to authenticated;

create or replace function private.current_user_has_pending_project_invite(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
	select
		(select auth.uid()) is not null
		and exists (
			select 1
			from public.project_invites invite
			where invite.project_id = p_project_id
				and invite.invitee_user_id = (select auth.uid())
				and invite.status = 'pending'
		);
$$;

revoke all on function private.current_user_has_pending_project_invite(uuid) from public;
grant execute on function private.current_user_has_pending_project_invite(uuid) to authenticated;

create or replace function private.current_user_can_access_project(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
	select
		(select private.current_user_is_project_member(p_project_id))
		or (select private.current_user_has_pending_project_invite(p_project_id));
$$;

revoke all on function private.current_user_can_access_project(uuid) from public;
grant execute on function private.current_user_can_access_project(uuid) to authenticated;

create or replace function private.current_user_shares_project_with_user(p_other_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
	select
		p_other_user_id is not null
		and (select auth.uid()) is not null
		and exists (
			select 1
			from public.project_memberships mine
			join public.project_memberships theirs
				on theirs.project_id = mine.project_id
			where mine.user_id = (select auth.uid())
				and theirs.user_id = p_other_user_id
		);
$$;

revoke all on function private.current_user_shares_project_with_user(uuid) from public;
grant execute on function private.current_user_shares_project_with_user(uuid) to authenticated;

drop policy if exists "Users can read their profile" on public.profiles;
drop policy if exists "Users can read related profiles" on public.profiles;
create policy "Users can read related profiles"
on public.profiles
for select
to authenticated
using (
	(select auth.uid()) = user_id
	or (select private.current_user_shares_project_with_user(profiles.user_id))
);

drop policy if exists "Users can read their projects" on public.projects;
drop policy if exists "Members can read accessible projects" on public.projects;
create policy "Members can read accessible projects"
on public.projects
for select
to authenticated
using (
	(select private.current_user_can_access_project(projects.id))
);

drop policy if exists "Members can read memberships" on public.project_memberships;
create policy "Members can read memberships"
on public.project_memberships
for select
to authenticated
using (
	(select private.current_user_is_project_member(project_memberships.project_id))
);

drop policy if exists "Users can read relevant invites" on public.project_invites;
create policy "Users can read relevant invites"
on public.project_invites
for select
to authenticated
using (
	(select auth.uid()) = invitee_user_id
	or (select private.current_user_is_project_owner(project_invites.project_id))
);

drop policy if exists "Members can read private chat state" on public.project_user_state;
create policy "Members can read private chat state"
on public.project_user_state
for select
to authenticated
using (
	(select auth.uid()) = user_id
	and (select private.current_user_is_project_member(project_user_state.project_id))
);

drop policy if exists "Members can insert private chat state" on public.project_user_state;
create policy "Members can insert private chat state"
on public.project_user_state
for insert
to authenticated
with check (
	(select auth.uid()) = user_id
	and (select private.current_user_is_project_member(project_user_state.project_id))
);

drop policy if exists "Members can update private chat state" on public.project_user_state;
create policy "Members can update private chat state"
on public.project_user_state
for update
to authenticated
using (
	(select auth.uid()) = user_id
	and (select private.current_user_is_project_member(project_user_state.project_id))
)
with check ((select auth.uid()) = user_id);

drop policy if exists "Members can delete private chat state" on public.project_user_state;
create policy "Members can delete private chat state"
on public.project_user_state
for delete
to authenticated
using (
	(select auth.uid()) = user_id
	and (select private.current_user_is_project_member(project_user_state.project_id))
);

drop policy if exists "Members can read project columns" on public.project_columns;
create policy "Members can read project columns"
on public.project_columns
for select
to authenticated
using (
	(select private.current_user_is_project_member(project_columns.project_id))
);

drop policy if exists "Members can insert project columns" on public.project_columns;
create policy "Members can insert project columns"
on public.project_columns
for insert
to authenticated
with check (
	(select private.current_user_is_project_member(project_columns.project_id))
);

drop policy if exists "Members can update project columns" on public.project_columns;
create policy "Members can update project columns"
on public.project_columns
for update
to authenticated
using (
	(select private.current_user_is_project_member(project_columns.project_id))
)
with check (
	(select private.current_user_is_project_member(project_columns.project_id))
);

drop policy if exists "Members can delete project columns" on public.project_columns;
create policy "Members can delete project columns"
on public.project_columns
for delete
to authenticated
using (
	(select private.current_user_is_project_member(project_columns.project_id))
);

drop policy if exists "Members can read project tasks" on public.project_tasks;
create policy "Members can read project tasks"
on public.project_tasks
for select
to authenticated
using (
	(select private.current_user_is_project_member(project_tasks.project_id))
);

drop policy if exists "Members can insert project tasks" on public.project_tasks;
create policy "Members can insert project tasks"
on public.project_tasks
for insert
to authenticated
with check (
	(select private.current_user_is_project_member(project_tasks.project_id))
);

drop policy if exists "Members can update project tasks" on public.project_tasks;
create policy "Members can update project tasks"
on public.project_tasks
for update
to authenticated
using (
	(select private.current_user_is_project_member(project_tasks.project_id))
)
with check (
	(select private.current_user_is_project_member(project_tasks.project_id))
);

drop policy if exists "Members can delete project tasks" on public.project_tasks;
create policy "Members can delete project tasks"
on public.project_tasks
for delete
to authenticated
using (
	(select private.current_user_is_project_member(project_tasks.project_id))
);
