alter table public.profiles
add column if not exists username text;

create unique index if not exists profiles_username_unique_idx
on public.profiles (lower(username))
where username is not null;

create or replace function public.normalize_profile_username()
returns trigger
language plpgsql
as $$
begin
	if new.username is null then
		return new;
	end if;

	new.username = nullif(lower(trim(new.username)), '');

	if new.username is not null and new.username !~ '^[a-z0-9_]{3,32}$' then
		raise exception 'Username must be 3-32 characters using lowercase letters, numbers, or underscores.'
			using errcode = '22023';
	end if;

	return new;
end;
$$;

drop trigger if exists profiles_normalize_username on public.profiles;
create trigger profiles_normalize_username
before insert or update of username on public.profiles
for each row
execute procedure public.normalize_profile_username();

create or replace function public.check_username_available(
	candidate_username text,
	requesting_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
	normalized_username text;
begin
	normalized_username = nullif(lower(trim(candidate_username)), '');

	if normalized_username is null then
		return false;
	end if;

	if normalized_username !~ '^[a-z0-9_]{3,32}$' then
		return false;
	end if;

	return not exists (
		select 1
		from public.profiles profile
		where lower(profile.username) = normalized_username
			and profile.user_id <> coalesce(requesting_user_id, auth.uid())
	);
end;
$$;