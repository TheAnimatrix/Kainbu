create table if not exists public.project_boards (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references public.projects (id) on delete cascade,
	name text not null default 'Board',
	position integer not null default 0,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.project_pages (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references public.projects (id) on delete cascade,
	name text not null default 'Page',
	content text not null default '',
	position integer not null default 0,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists project_boards_project_position_idx
on public.project_boards (project_id, position);

create index if not exists project_pages_project_position_idx
on public.project_pages (project_id, position);

drop trigger if exists project_boards_set_updated_at on public.project_boards;
create trigger project_boards_set_updated_at
before update on public.project_boards
for each row
execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists project_pages_set_updated_at on public.project_pages;
create trigger project_pages_set_updated_at
before update on public.project_pages
for each row
execute procedure public.set_current_timestamp_updated_at();

insert into public.project_boards (project_id, name, position, created_at, updated_at)
select
	project.id,
	'Board',
	0,
	project.created_at,
	project.updated_at
from public.projects project
where not exists (
	select 1
	from public.project_boards board
	where board.project_id = project.id
);

insert into public.project_pages (project_id, name, content, position, created_at, updated_at)
select
	project.id,
	'Notes',
	project.scratchpad_data,
	0,
	project.created_at,
	project.updated_at
from public.projects project
where not exists (
	select 1
	from public.project_pages page
	where page.project_id = project.id
);

alter table public.project_columns
add column if not exists board_id uuid references public.project_boards (id) on delete cascade;

alter table public.project_tasks
add column if not exists board_id uuid references public.project_boards (id) on delete cascade;

create or replace function public.ensure_project_board_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
	default_board_id uuid;
begin
	if new.board_id is not null then
		return new;
	end if;

	select board.id
	into default_board_id
	from public.project_boards board
	where board.project_id = new.project_id
	order by board.position asc, board.created_at asc
	limit 1;

	if default_board_id is null then
		insert into public.project_boards (project_id, name, position)
		values (new.project_id, 'Board', 0)
		returning id into default_board_id;
	end if;

	new.board_id = default_board_id;
	return new;
end;
$$;

create or replace function public.ensure_project_task_board_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
	resolved_board_id uuid;
begin
	if new.board_id is not null then
		return new;
	end if;

	select column_row.board_id
	into resolved_board_id
	from public.project_columns column_row
	where column_row.project_id = new.project_id
		and column_row.id = new.column_id
	limit 1;

	if resolved_board_id is null then
		select board.id
		into resolved_board_id
		from public.project_boards board
		where board.project_id = new.project_id
		order by board.position asc, board.created_at asc
		limit 1;
	end if;

	new.board_id = resolved_board_id;
	return new;
end;
$$;

drop trigger if exists project_columns_ensure_board_id on public.project_columns;
create trigger project_columns_ensure_board_id
before insert or update of project_id, board_id on public.project_columns
for each row
execute procedure public.ensure_project_board_id();

drop trigger if exists project_tasks_ensure_board_id on public.project_tasks;
create trigger project_tasks_ensure_board_id
before insert or update of project_id, column_id, board_id on public.project_tasks
for each row
execute procedure public.ensure_project_task_board_id();

update public.project_columns column_row
set board_id = board.id
from lateral (
	select project_board.id
	from public.project_boards project_board
	where project_board.project_id = column_row.project_id
	order by project_board.position asc, project_board.created_at asc
	limit 1
) board
where column_row.board_id is null;

update public.project_tasks task_row
set board_id = column_row.board_id
from public.project_columns column_row
where task_row.project_id = column_row.project_id
	and task_row.column_id = column_row.id
	and task_row.board_id is null;

create index if not exists project_columns_project_board_position_idx
on public.project_columns (project_id, board_id, position);

create index if not exists project_tasks_project_board_column_position_idx
on public.project_tasks (project_id, board_id, column_id, position);