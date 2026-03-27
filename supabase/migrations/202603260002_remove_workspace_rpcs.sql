drop function if exists public.create_project_invite(uuid, text);
drop function if exists public.respond_to_project_invite(uuid, boolean);
drop function if exists public.cancel_project_invite(uuid);
drop function if exists public.remove_project_member(uuid, uuid);
drop function if exists public.leave_project(uuid);
drop function if exists public.touch_project_last_opened(uuid);
drop function if exists public.update_project_scratchpad(uuid, text, integer);
