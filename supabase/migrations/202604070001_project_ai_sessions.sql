alter table public.profiles
add column if not exists preferred_ai_model_id text not null default 'gemini-flash';

update public.profiles
set preferred_ai_model_id = case
	when coalesce(nullif(trim(preferred_ai_model_id), ''), '') <> '' then trim(preferred_ai_model_id)
	when preferred_model_preset = 'smart' then 'gemini-flash-thinking'
	else 'gemini-flash'
end
where preferred_ai_model_id is null
	or trim(preferred_ai_model_id) = ''
	or preferred_ai_model_id in ('fast', 'smart');

alter table public.project_user_state
add column if not exists active_ai_session_id uuid;

create table if not exists public.project_ai_sessions (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references public.projects (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	title text not null default 'New chat',
	model_id text not null default 'gemini-flash',
	history jsonb not null default '[]'::jsonb,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	last_message_at timestamptz not null default timezone('utc', now())
);

create index if not exists project_ai_sessions_project_user_updated_idx
on public.project_ai_sessions (project_id, user_id, updated_at desc);

create index if not exists project_ai_sessions_user_idx
on public.project_ai_sessions (user_id);

drop trigger if exists project_ai_sessions_set_updated_at on public.project_ai_sessions;
create trigger project_ai_sessions_set_updated_at
before update on public.project_ai_sessions
for each row
execute procedure public.set_current_timestamp_updated_at();

with source_rows as (
	select
		state.project_id,
		state.user_id,
		case
			when profile.preferred_ai_model_id is not null and trim(profile.preferred_ai_model_id) <> '' then trim(profile.preferred_ai_model_id)
			when profile.preferred_model_preset = 'smart' then 'gemini-flash-thinking'
			else 'gemini-flash'
		end as model_id,
		coalesce(state.chat_history, '[]'::jsonb) as history,
		coalesce(state.created_at, timezone('utc', now())) as created_at,
		coalesce(state.updated_at, timezone('utc', now())) as updated_at,
		coalesce(
			(
				select timezone('utc', to_timestamp((message.value ->> 'timestamp')::double precision / 1000.0))
				from jsonb_array_elements(coalesce(state.chat_history, '[]'::jsonb)) with ordinality as message(value, ordinality)
				where jsonb_typeof(message.value) = 'object'
					and message.value ? 'timestamp'
					and (message.value ->> 'timestamp') ~ '^[0-9]+$'
				order by message.ordinality desc
				limit 1
			),
			state.updated_at,
			state.created_at,
			timezone('utc', now())
		) as last_message_at
	from public.project_user_state state
	left join public.profiles profile
		on profile.user_id = state.user_id
	where not exists (
		select 1
		from public.project_ai_sessions session
		where session.project_id = state.project_id
			and session.user_id = state.user_id
	)
),
inserted_sessions as (
	insert into public.project_ai_sessions (
		id,
		project_id,
		user_id,
		title,
		model_id,
		history,
		created_at,
		updated_at,
		last_message_at
	)
	select
		gen_random_uuid(),
		source_rows.project_id,
		source_rows.user_id,
		'New chat',
		source_rows.model_id,
		source_rows.history,
		source_rows.created_at,
		source_rows.updated_at,
		source_rows.last_message_at
	from source_rows
	returning id, project_id, user_id
)
update public.project_user_state state
set active_ai_session_id = inserted_sessions.id
from inserted_sessions
where state.project_id = inserted_sessions.project_id
	and state.user_id = inserted_sessions.user_id
	and state.active_ai_session_id is null;

update public.project_user_state state
set active_ai_session_id = (
	select session.id
	from public.project_ai_sessions session
	where session.project_id = state.project_id
		and session.user_id = state.user_id
	order by session.updated_at asc, session.created_at asc, session.id asc
	limit 1
)
where state.active_ai_session_id is null;

alter table public.project_ai_sessions enable row level security;

drop policy if exists "Members can read private ai sessions" on public.project_ai_sessions;
create policy "Members can read private ai sessions"
on public.project_ai_sessions
for select
to authenticated
using (
	(select auth.uid()) = user_id
	and (select private.current_user_is_project_member(project_ai_sessions.project_id))
);

drop policy if exists "Members can insert private ai sessions" on public.project_ai_sessions;
create policy "Members can insert private ai sessions"
on public.project_ai_sessions
for insert
to authenticated
with check (
	(select auth.uid()) = user_id
	and (select private.current_user_is_project_member(project_ai_sessions.project_id))
);

drop policy if exists "Members can update private ai sessions" on public.project_ai_sessions;
create policy "Members can update private ai sessions"
on public.project_ai_sessions
for update
to authenticated
using (
	(select auth.uid()) = user_id
	and (select private.current_user_is_project_member(project_ai_sessions.project_id))
)
with check (
	(select auth.uid()) = user_id
	and (select private.current_user_is_project_member(project_ai_sessions.project_id))
);

drop policy if exists "Members can delete private ai sessions" on public.project_ai_sessions;
create policy "Members can delete private ai sessions"
on public.project_ai_sessions
for delete
to authenticated
using (
	(select auth.uid()) = user_id
	and (select private.current_user_is_project_member(project_ai_sessions.project_id))
);
