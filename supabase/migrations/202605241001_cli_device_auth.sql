create table if not exists public.cli_device_auth (
	device_id uuid primary key,
	user_code text not null,
	status text not null default 'pending' check (status in ('pending', 'approved', 'consumed', 'expired')),
	user_id uuid references auth.users (id) on delete cascade,
	exchange_token text,
	expires_at timestamptz not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index if not exists cli_device_auth_user_code_pending_idx
	on public.cli_device_auth (user_code)
	where status = 'pending';

create index if not exists cli_device_auth_exchange_token_idx
	on public.cli_device_auth (exchange_token)
	where exchange_token is not null;

alter table public.cli_device_auth enable row level security;

create policy "cli_device_auth_no_client_access"
	on public.cli_device_auth
	for all
	using (false)
	with check (false);
