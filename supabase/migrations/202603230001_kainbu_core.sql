create extension if not exists pgcrypto;

create table if not exists public.profiles (
	user_id uuid primary key references auth.users (id) on delete cascade,
	default_show_checkbox boolean not null default true,
	preferred_model_preset text not null default 'fast' check (preferred_model_preset in ('fast', 'smart')),
	preferred_chat_mode text not null default 'auto' check (preferred_chat_mode in ('auto', 'chat', 'edit')),
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.projects (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	name text not null default 'New Project',
	kanban_data jsonb not null default '[]'::jsonb,
	scratchpad_data text not null default '',
	chat_history jsonb not null default '[]'::jsonb,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	last_opened_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at = timezone('utc', now());
	return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row
execute procedure public.set_current_timestamp_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	insert into public.profiles (user_id)
	values (new.id)
	on conflict (user_id) do nothing;

	return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row
execute procedure public.handle_new_user_profile();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;

drop policy if exists "Users can read their profile" on public.profiles;
create policy "Users can read their profile"
on public.profiles
for select
using (auth.uid() = user_id);

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
create policy "Users can read their projects"
on public.projects
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their projects" on public.projects;
create policy "Users can insert their projects"
on public.projects
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their projects" on public.projects;
create policy "Users can update their projects"
on public.projects
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their projects" on public.projects;
create policy "Users can delete their projects"
on public.projects
for delete
using (auth.uid() = user_id);
