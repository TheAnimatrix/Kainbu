create extension if not exists vector with schema extensions;

create table if not exists public.project_ai_chunks (
	id bigint primary key generated always as identity,
	project_id uuid not null references public.projects (id) on delete cascade,
	source_kind text not null check (source_kind in ('board', 'column', 'task', 'page', 'comment')),
	source_id text not null,
	title text not null default '',
	content text not null default '',
	chunk_index integer not null default 0 check (chunk_index >= 0),
	chunk_count integer not null default 1 check (chunk_count >= 1),
	char_start integer not null default 0 check (char_start >= 0),
	char_end integer not null default 0 check (char_end >= 0),
	token_estimate integer not null default 0 check (token_estimate >= 0),
	content_hash text not null,
	metadata jsonb not null default '{}'::jsonb,
	embedding extensions.vector(1536),
	fts tsvector generated always as (
		to_tsvector('english', trim(both from coalesce(title, '') || ' ' || coalesce(content, '')))
	) stored,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	unique (project_id, source_kind, source_id, chunk_index)
);

create index if not exists project_ai_chunks_project_source_idx
on public.project_ai_chunks (project_id, source_kind, source_id);

create index if not exists project_ai_chunks_project_updated_idx
on public.project_ai_chunks (project_id, updated_at desc);

create index if not exists project_ai_chunks_fts_idx
on public.project_ai_chunks
using gin (fts);

create index if not exists project_ai_chunks_embedding_idx
on public.project_ai_chunks
using hnsw (embedding vector_cosine_ops);

drop trigger if exists project_ai_chunks_set_updated_at on public.project_ai_chunks;
create trigger project_ai_chunks_set_updated_at
before update on public.project_ai_chunks
for each row
execute procedure public.set_current_timestamp_updated_at();

alter table public.project_ai_chunks enable row level security;

drop policy if exists "Members can read project ai chunks" on public.project_ai_chunks;
create policy "Members can read project ai chunks"
on public.project_ai_chunks
for select
to authenticated
using ((select private.current_user_is_project_member(project_ai_chunks.project_id)));

drop policy if exists "Members can insert project ai chunks" on public.project_ai_chunks;
create policy "Members can insert project ai chunks"
on public.project_ai_chunks
for insert
to authenticated
with check ((select private.current_user_is_project_member(project_ai_chunks.project_id)));

drop policy if exists "Members can update project ai chunks" on public.project_ai_chunks;
create policy "Members can update project ai chunks"
on public.project_ai_chunks
for update
to authenticated
using ((select private.current_user_is_project_member(project_ai_chunks.project_id)))
with check ((select private.current_user_is_project_member(project_ai_chunks.project_id)));

drop policy if exists "Members can delete project ai chunks" on public.project_ai_chunks;
create policy "Members can delete project ai chunks"
on public.project_ai_chunks
for delete
to authenticated
using ((select private.current_user_is_project_member(project_ai_chunks.project_id)));

create or replace function public.match_project_ai_chunks(
	p_project_id uuid,
	p_query_text text,
	p_query_embedding extensions.vector(1536) default null,
	p_source_kinds text[] default null,
	p_limit integer default 24
)
returns table (
	id bigint,
	source_kind text,
	source_id text,
	title text,
	content text,
	chunk_index integer,
	chunk_count integer,
	char_start integer,
	char_end integer,
	metadata jsonb,
	updated_at timestamptz,
	lexical_score double precision,
	semantic_score double precision,
	score double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
	with query_input as (
		select
			case
				when coalesce(trim(p_query_text), '') = '' then null
				else websearch_to_tsquery('english', trim(p_query_text))
			end as tsq
	)
	select
		chunk.id,
		chunk.source_kind,
		chunk.source_id,
		chunk.title,
		chunk.content,
		chunk.chunk_index,
		chunk.chunk_count,
		chunk.char_start,
		chunk.char_end,
		chunk.metadata,
		chunk.updated_at,
		case
			when query_input.tsq is null then 0::double precision
			else ts_rank_cd(chunk.fts, query_input.tsq)::double precision
		end as lexical_score,
		case
			when p_query_embedding is null or chunk.embedding is null then 0::double precision
			else greatest(0::double precision, 1 - (chunk.embedding <=> p_query_embedding))
		end as semantic_score,
		(
			case
				when query_input.tsq is null then 0::double precision
				else ts_rank_cd(chunk.fts, query_input.tsq)::double precision * 0.55
			end +
			case
				when p_query_embedding is null or chunk.embedding is null then 0::double precision
				else greatest(0::double precision, 1 - (chunk.embedding <=> p_query_embedding)) * 0.45
			end
		) as score
	from public.project_ai_chunks chunk
	cross join query_input
	where
		chunk.project_id = p_project_id
		and (
			p_source_kinds is null
			or cardinality(p_source_kinds) = 0
			or chunk.source_kind = any(p_source_kinds)
		)
		and (
			query_input.tsq is null
			or chunk.fts @@ query_input.tsq
			or (p_query_embedding is not null and chunk.embedding is not null)
		)
	order by
		score desc,
		chunk.updated_at desc,
		chunk.id desc
	limit greatest(1, least(coalesce(p_limit, 24), 64));
$$;

grant execute on function public.match_project_ai_chunks(uuid, text, extensions.vector(1536), text[], integer) to authenticated;
