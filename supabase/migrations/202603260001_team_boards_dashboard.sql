alter table public.profiles
add column if not exists email text;

update public.profiles profile
set email = users.email
from auth.users users
where users.id = profile.user_id
	and profile.email is distinct from users.email;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	insert into public.profiles (user_id, email)
	values (new.id, new.email)
	on conflict (user_id) do update
	set email = excluded.email;

	return new;
end;
$$;

create or replace function public.sync_user_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	update public.profiles
	set
		email = new.email,
		updated_at = timezone('utc', now())
	where user_id = new.id
		and email is distinct from new.email;

	return new;
end;
$$;

drop trigger if exists on_auth_user_updated_profile on auth.users;
create trigger on_auth_user_updated_profile
after update of email on auth.users
for each row
execute procedure public.sync_user_profile_email();

alter table public.projects
add column if not exists scratchpad_rev integer not null default 0;

create table if not exists public.project_memberships (
	project_id uuid not null references public.projects (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	role text not null check (role in ('owner', 'member')),
	joined_at timestamptz not null default timezone('utc', now()),
	last_opened_at timestamptz not null default timezone('utc', now()),
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	primary key (project_id, user_id)
);

create table if not exists public.project_invites (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references public.projects (id) on delete cascade,
	invitee_user_id uuid not null references auth.users (id) on delete cascade,
	invitee_email text not null,
	invited_by_user_id uuid not null references auth.users (id) on delete cascade,
	status text not null check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	responded_at timestamptz,
	unique (project_id, invitee_user_id)
);

create table if not exists public.project_user_state (
	project_id uuid not null references public.projects (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	chat_history jsonb not null default '[]'::jsonb,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	primary key (project_id, user_id)
);

create table if not exists public.project_columns (
	project_id uuid not null references public.projects (id) on delete cascade,
	id text not null,
	title text not null,
	color text,
	width integer not null default 268,
	position integer not null default 0,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	primary key (project_id, id)
);

create table if not exists public.project_tasks (
	project_id uuid not null references public.projects (id) on delete cascade,
	id text not null,
	column_id text not null,
	title text not null,
	description text not null default '',
	color text,
	tags jsonb not null default '[]'::jsonb,
	has_checkbox boolean not null default false,
	checked boolean not null default false,
	completed_at bigint,
	countdown_at bigint,
	alarm_at bigint,
	position integer not null default 0,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	primary key (project_id, id),
	constraint project_tasks_column_fk
		foreign key (project_id, column_id)
		references public.project_columns (project_id, id)
		on delete cascade
);

create index if not exists project_memberships_user_idx
on public.project_memberships (user_id);

create index if not exists project_invites_invitee_idx
on public.project_invites (invitee_user_id, status);

create index if not exists project_invites_owner_idx
on public.project_invites (project_id, status);

create index if not exists project_user_state_user_idx
on public.project_user_state (user_id);

create index if not exists project_columns_project_position_idx
on public.project_columns (project_id, position);

create index if not exists project_tasks_project_column_position_idx
on public.project_tasks (project_id, column_id, position);

drop trigger if exists project_memberships_set_updated_at on public.project_memberships;
create trigger project_memberships_set_updated_at
before update on public.project_memberships
for each row
execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists project_invites_set_updated_at on public.project_invites;
create trigger project_invites_set_updated_at
before update on public.project_invites
for each row
execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists project_user_state_set_updated_at on public.project_user_state;
create trigger project_user_state_set_updated_at
before update on public.project_user_state
for each row
execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists project_columns_set_updated_at on public.project_columns;
create trigger project_columns_set_updated_at
before update on public.project_columns
for each row
execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists project_tasks_set_updated_at on public.project_tasks;
create trigger project_tasks_set_updated_at
before update on public.project_tasks
for each row
execute procedure public.set_current_timestamp_updated_at();

create or replace function public.touch_project_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	update public.projects
	set updated_at = timezone('utc', now())
	where id = coalesce(new.project_id, old.project_id);

	return coalesce(new, old);
end;
$$;

drop trigger if exists project_columns_touch_project on public.project_columns;
create trigger project_columns_touch_project
after insert or update or delete on public.project_columns
for each row
execute procedure public.touch_project_updated_at();

drop trigger if exists project_tasks_touch_project on public.project_tasks;
create trigger project_tasks_touch_project
after insert or update or delete on public.project_tasks
for each row
execute procedure public.touch_project_updated_at();

create or replace function public.handle_new_project_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	insert into public.project_memberships (
		project_id,
		user_id,
		role,
		joined_at,
		last_opened_at
	)
	values (
		new.id,
		new.user_id,
		'owner',
		coalesce(new.created_at, timezone('utc', now())),
		coalesce(new.last_opened_at, timezone('utc', now()))
	)
	on conflict (project_id, user_id) do update
	set
		role = 'owner',
		last_opened_at = excluded.last_opened_at;

	return new;
end;
$$;

drop trigger if exists projects_create_owner_membership on public.projects;
create trigger projects_create_owner_membership
after insert on public.projects
for each row
execute procedure public.handle_new_project_membership();

insert into public.project_memberships (
	project_id,
	user_id,
	role,
	joined_at,
	last_opened_at,
	created_at,
	updated_at
)
select
	project.id,
	project.user_id,
	'owner',
	project.created_at,
	project.last_opened_at,
	project.created_at,
	project.updated_at
from public.projects project
on conflict (project_id, user_id) do update
set
	role = 'owner',
	last_opened_at = excluded.last_opened_at;

insert into public.project_user_state (
	project_id,
	user_id,
	chat_history,
	created_at,
	updated_at
)
select
	project.id,
	project.user_id,
	coalesce(project.chat_history, '[]'::jsonb),
	project.created_at,
	project.updated_at
from public.projects project
on conflict (project_id, user_id) do nothing;

insert into public.project_columns (
	project_id,
	id,
	title,
	color,
	width,
	position,
	created_at,
	updated_at
)
select
	project.id,
	coalesce(nullif(trim(column_data.value ->> 'id'), ''), format('legacy-column-%s', column_data.ordinality)),
	coalesce(nullif(trim(column_data.value ->> 'title'), ''), format('Column %s', column_data.ordinality)),
	nullif(trim(column_data.value ->> 'color'), ''),
	case
		when coalesce(column_data.value ->> 'width', '') ~ '^-?[0-9]+$'
			then greatest(220, least(420, (column_data.value ->> 'width')::integer))
		else 268
	end,
	column_data.ordinality - 1,
	project.created_at,
	project.updated_at
from public.projects project
cross join lateral jsonb_array_elements(
	case
		when jsonb_typeof(project.kanban_data) = 'array' then project.kanban_data
		else '[]'::jsonb
	end
) with ordinality as column_data(value, ordinality)
on conflict (project_id, id) do nothing;

insert into public.project_tasks (
	project_id,
	id,
	column_id,
	title,
	description,
	color,
	tags,
	has_checkbox,
	checked,
	completed_at,
	countdown_at,
	alarm_at,
	position,
	created_at,
	updated_at
)
select
	project.id,
	coalesce(nullif(trim(task_data.value ->> 'id'), ''), format('legacy-task-%s-%s', column_data.ordinality, task_data.ordinality)),
	coalesce(nullif(trim(column_data.value ->> 'id'), ''), format('legacy-column-%s', column_data.ordinality)),
	coalesce(nullif(trim(task_data.value ->> 'title'), ''), format('Task %s', task_data.ordinality)),
	coalesce(task_data.value ->> 'description', ''),
	nullif(trim(task_data.value ->> 'color'), ''),
	case
		when jsonb_typeof(task_data.value -> 'tags') = 'array' then task_data.value -> 'tags'
		else '[]'::jsonb
	end,
	case
		when lower(coalesce(task_data.value ->> 'hasCheckbox', '')) = 'true' then true
		when lower(coalesce(task_data.value ->> 'hasCheckbox', '')) = 'false' then false
		else false
	end,
	case
		when lower(coalesce(task_data.value ->> 'checked', '')) = 'true' then true
		else false
	end,
	case
		when coalesce(task_data.value ->> 'completedAt', '') ~ '^-?[0-9]+$'
			then (task_data.value ->> 'completedAt')::bigint
		else null
	end,
	case
		when coalesce(task_data.value ->> 'countdownAt', '') ~ '^-?[0-9]+$'
			then (task_data.value ->> 'countdownAt')::bigint
		else null
	end,
	case
		when coalesce(task_data.value ->> 'alarmAt', '') ~ '^-?[0-9]+$'
			then (task_data.value ->> 'alarmAt')::bigint
		else null
	end,
	task_data.ordinality - 1,
	project.created_at,
	project.updated_at
from public.projects project
cross join lateral jsonb_array_elements(
	case
		when jsonb_typeof(project.kanban_data) = 'array' then project.kanban_data
		else '[]'::jsonb
	end
) with ordinality as column_data(value, ordinality)
cross join lateral jsonb_array_elements(
	case
		when jsonb_typeof(column_data.value -> 'tasks') = 'array' then column_data.value -> 'tasks'
		else '[]'::jsonb
	end
) with ordinality as task_data(value, ordinality)
on conflict (project_id, id) do nothing;

alter table public.project_memberships enable row level security;
alter table public.project_invites enable row level security;
alter table public.project_user_state enable row level security;
alter table public.project_columns enable row level security;
alter table public.project_tasks enable row level security;

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
create policy "Users can read related profiles"
on public.profiles
for select
to authenticated
using (
	(select auth.uid()) = user_id
	or (select private.current_user_shares_project_with_user(profiles.user_id))
);

drop policy if exists "Users can insert their profile" on public.profiles;
create policy "Users can insert their profile"
on public.profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile"
on public.profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read their projects" on public.projects;
create policy "Members can read accessible projects"
on public.projects
for select
to authenticated
using (
	(select private.current_user_can_access_project(projects.id))
);

drop policy if exists "Users can insert their projects" on public.projects;
create policy "Owners can insert their projects"
on public.projects
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their projects" on public.projects;
create policy "Owners can update their projects"
on public.projects
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their projects" on public.projects;
create policy "Owners can delete their projects"
on public.projects
for delete
using (auth.uid() = user_id);

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

create or replace function public.create_project_invite(
	p_project_id uuid,
	p_invitee_email text
)
returns public.project_invites
language plpgsql
security definer
set search_path = public, auth
as $$
declare
	v_project public.projects%rowtype;
	v_invitee_id uuid;
	v_invitee_email text;
	v_invite public.project_invites%rowtype;
begin
	select *
	into v_project
	from public.projects
	where id = p_project_id;

	if v_project.id is null then
		raise exception 'Project not found';
	end if;

	if auth.uid() is distinct from v_project.user_id then
		raise exception 'Only the project owner can invite collaborators';
	end if;

	select users.id, users.email
	into v_invitee_id, v_invitee_email
	from auth.users users
	where lower(users.email) = lower(trim(p_invitee_email))
	limit 1;

	if v_invitee_id is null then
		raise exception 'This email does not belong to an existing account';
	end if;

	if v_invitee_id = v_project.user_id then
		raise exception 'The owner already has access to this board';
	end if;

	if exists (
		select 1
		from public.project_memberships membership
		where membership.project_id = p_project_id
			and membership.user_id = v_invitee_id
	) then
		raise exception 'This collaborator already has access to the board';
	end if;

	insert into public.project_invites (
		project_id,
		invitee_user_id,
		invitee_email,
		invited_by_user_id,
		status,
		responded_at
	)
	values (
		p_project_id,
		v_invitee_id,
		v_invitee_email,
		auth.uid(),
		'pending',
		null
	)
	on conflict (project_id, invitee_user_id) do update
	set
		invitee_email = excluded.invitee_email,
		invited_by_user_id = excluded.invited_by_user_id,
		status = 'pending',
		responded_at = null,
		updated_at = timezone('utc', now())
	returning *
	into v_invite;

	return v_invite;
end;
$$;

create or replace function public.respond_to_project_invite(
	p_invite_id uuid,
	p_accept boolean
)
returns public.project_invites
language plpgsql
security definer
set search_path = public, auth
as $$
declare
	v_invite public.project_invites%rowtype;
begin
	select *
	into v_invite
	from public.project_invites
	where id = p_invite_id;

	if v_invite.id is null then
		raise exception 'Invite not found';
	end if;

	if v_invite.invitee_user_id is distinct from auth.uid() then
		raise exception 'You can only respond to your own invite';
	end if;

	if v_invite.status <> 'pending' then
		raise exception 'This invite has already been handled';
	end if;

	if p_accept then
		update public.project_invites
		set
			status = 'accepted',
			responded_at = timezone('utc', now())
		where id = p_invite_id
		returning *
		into v_invite;

		insert into public.project_memberships (
			project_id,
			user_id,
			role,
			joined_at,
			last_opened_at
		)
		values (
			v_invite.project_id,
			v_invite.invitee_user_id,
			'member',
			timezone('utc', now()),
			timezone('utc', now())
		)
		on conflict (project_id, user_id) do update
		set
			role = 'member',
			last_opened_at = greatest(
				public.project_memberships.last_opened_at,
				timezone('utc', now())
			);
	else
		update public.project_invites
		set
			status = 'rejected',
			responded_at = timezone('utc', now())
		where id = p_invite_id
		returning *
		into v_invite;
	end if;

	return v_invite;
end;
$$;

create or replace function public.cancel_project_invite(p_invite_id uuid)
returns public.project_invites
language plpgsql
security definer
set search_path = public, auth
as $$
declare
	v_invite public.project_invites%rowtype;
	v_project public.projects%rowtype;
begin
	select *
	into v_invite
	from public.project_invites
	where id = p_invite_id;

	if v_invite.id is null then
		raise exception 'Invite not found';
	end if;

	select *
	into v_project
	from public.projects
	where id = v_invite.project_id;

	if v_project.user_id is distinct from auth.uid() then
		raise exception 'Only the project owner can cancel invites';
	end if;

	update public.project_invites
	set
		status = 'cancelled',
		responded_at = timezone('utc', now())
	where id = p_invite_id
	returning *
	into v_invite;

	return v_invite;
end;
$$;

create or replace function public.remove_project_member(
	p_project_id uuid,
	p_member_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
	v_project public.projects%rowtype;
begin
	select *
	into v_project
	from public.projects
	where id = p_project_id;

	if v_project.id is null then
		raise exception 'Project not found';
	end if;

	if v_project.user_id is distinct from auth.uid() then
		raise exception 'Only the project owner can remove members';
	end if;

	if p_member_user_id = v_project.user_id then
		raise exception 'Use project deletion to remove the owner';
	end if;

	delete from public.project_user_state
	where project_id = p_project_id
		and user_id = p_member_user_id;

	delete from public.project_memberships
	where project_id = p_project_id
		and user_id = p_member_user_id;
end;
$$;

create or replace function public.leave_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
	v_membership public.project_memberships%rowtype;
begin
	select *
	into v_membership
	from public.project_memberships
	where project_id = p_project_id
		and user_id = auth.uid();

	if v_membership.project_id is null then
		raise exception 'Membership not found';
	end if;

	if v_membership.role = 'owner' then
		raise exception 'The owner cannot leave their own board';
	end if;

	delete from public.project_user_state
	where project_id = p_project_id
		and user_id = auth.uid();

	delete from public.project_memberships
	where project_id = p_project_id
		and user_id = auth.uid();
end;
$$;

create or replace function public.touch_project_last_opened(p_project_id uuid)
returns public.project_memberships
language plpgsql
security definer
set search_path = public, auth
as $$
declare
	v_membership public.project_memberships%rowtype;
begin
	update public.project_memberships
	set last_opened_at = timezone('utc', now())
	where project_id = p_project_id
		and user_id = auth.uid()
	returning *
	into v_membership;

	if v_membership.project_id is null then
		raise exception 'Membership not found';
	end if;

	return v_membership;
end;
$$;

create or replace function public.update_project_scratchpad(
	p_project_id uuid,
	p_scratchpad_data text,
	p_expected_rev integer
)
returns table (
	ok boolean,
	scratchpad_data text,
	scratchpad_rev integer,
	updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
	v_project public.projects%rowtype;
begin
	if not exists (
		select 1
		from public.project_memberships membership
		where membership.project_id = p_project_id
			and membership.user_id = auth.uid()
	) then
		raise exception 'Unauthorized';
	end if;

	select *
	into v_project
	from public.projects
	where id = p_project_id
	for update;

	if v_project.id is null then
		raise exception 'Project not found';
	end if;

	if v_project.scratchpad_rev = p_expected_rev then
		update public.projects
		set
			scratchpad_data = p_scratchpad_data,
			scratchpad_rev = scratchpad_rev + 1,
			updated_at = timezone('utc', now())
		where id = p_project_id
		returning true, projects.scratchpad_data, projects.scratchpad_rev, projects.updated_at
		into ok, scratchpad_data, scratchpad_rev, updated_at;
	else
		ok := false;
		scratchpad_data := v_project.scratchpad_data;
		scratchpad_rev := v_project.scratchpad_rev;
		updated_at := v_project.updated_at;
	end if;

	return next;
end;
$$;

grant execute on function public.create_project_invite(uuid, text) to authenticated;
grant execute on function public.respond_to_project_invite(uuid, boolean) to authenticated;
grant execute on function public.cancel_project_invite(uuid) to authenticated;
grant execute on function public.remove_project_member(uuid, uuid) to authenticated;
grant execute on function public.leave_project(uuid) to authenticated;
grant execute on function public.touch_project_last_opened(uuid) to authenticated;
grant execute on function public.update_project_scratchpad(uuid, text, integer) to authenticated;

do $$
begin
	begin
		alter publication supabase_realtime add table public.projects;
	exception
		when duplicate_object then null;
	end;

	begin
		alter publication supabase_realtime add table public.project_memberships;
	exception
		when duplicate_object then null;
	end;

	begin
		alter publication supabase_realtime add table public.project_invites;
	exception
		when duplicate_object then null;
	end;

	begin
		alter publication supabase_realtime add table public.project_columns;
	exception
		when duplicate_object then null;
	end;

	begin
		alter publication supabase_realtime add table public.project_tasks;
	exception
		when duplicate_object then null;
	end;
end
$$;
