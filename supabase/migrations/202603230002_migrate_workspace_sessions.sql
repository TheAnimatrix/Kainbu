do $$
begin
	if to_regclass('public.workspace_sessions') is null then
		raise notice 'public.workspace_sessions does not exist; skipping legacy migration.';
		return;
	end if;

	insert into public.profiles (
		user_id,
		default_show_checkbox,
		preferred_model_preset,
		preferred_chat_mode,
		created_at,
		updated_at
	)
	select
		distinct legacy.user_id,
		true,
		'fast',
		'auto',
		coalesce(legacy.created_at, timezone('utc'::text, now())),
		coalesce(legacy.last_modified, legacy.created_at, timezone('utc'::text, now()))
	from public.workspace_sessions legacy
	where not exists (
		select 1
		from public.profiles profile
		where profile.user_id = legacy.user_id
	);

	insert into public.projects (
		id,
		user_id,
		name,
		kanban_data,
		scratchpad_data,
		chat_history,
		created_at,
		updated_at,
		last_opened_at
	)
	select
		legacy.id,
		legacy.user_id,
		coalesce(nullif(trim(legacy.name), ''), 'New Project'),
		coalesce(legacy.kanban_data, '[]'::jsonb),
		coalesce(legacy.scratchpad_data, ''),
		coalesce(
			(
				select jsonb_agg(
					jsonb_strip_nulls(
						jsonb_build_object(
							'id',
							coalesce(nullif(message.value ->> 'id', ''), gen_random_uuid()::text),
							'role',
							case
								when lower(coalesce(message.value ->> 'role', 'user')) in ('assistant', 'model')
									then 'assistant'
								else 'user'
							end,
							'text',
							coalesce(message.value ->> 'text', ''),
							'timestamp',
							case
								when coalesce(message.value ->> 'timestamp', '') ~ '^[0-9]+$'
									then (message.value ->> 'timestamp')::bigint
								else (extract(epoch from coalesce(legacy.last_modified, legacy.created_at, timezone('utc'::text, now()))) * 1000)::bigint
							end,
							'attachments',
							case
								when jsonb_typeof(message.value -> 'attachments') = 'array'
									then message.value -> 'attachments'
								when jsonb_typeof(message.value -> 'images') = 'array'
									then coalesce(
										(
											select jsonb_agg(
												jsonb_build_object(
													'id', gen_random_uuid()::text,
													'kind', 'image',
													'name', format('legacy-image-%s.png', image.ordinality),
													'mimeType', 'image/png',
													'content', image.value
												)
												order by image.ordinality
											)
											from jsonb_array_elements_text(message.value -> 'images') with ordinality as image(value, ordinality)
										),
										'[]'::jsonb
									)
								else '[]'::jsonb
							end,
							'metadata',
							case
								when jsonb_typeof(message.value -> 'metadata') = 'object'
									then jsonb_strip_nulls(
										jsonb_build_object(
											'model',
											coalesce(nullif(message.value -> 'metadata' ->> 'model', ''), 'Legacy'),
											'latencyMs',
											case
												when coalesce(message.value -> 'metadata' ->> 'latencyMs', '') ~ E'^-?[0-9]+(\\.[0-9]+)?$'
													then round((message.value -> 'metadata' ->> 'latencyMs')::numeric)::integer
												when coalesce(message.value -> 'metadata' ->> 'latency', '') ~ E'^-?[0-9]+(\\.[0-9]+)?$'
													then round((message.value -> 'metadata' ->> 'latency')::numeric * 1000)::integer
												else 0
											end,
											'tokens',
											case
												when coalesce(message.value -> 'metadata' ->> 'tokens', '') ~ '^-?[0-9]+$'
													then (message.value -> 'metadata' ->> 'tokens')::integer
												else null
											end,
											'mode',
											case
												when coalesce(message.value -> 'metadata' ->> 'mode', '') in ('auto', 'chat', 'edit')
													then message.value -> 'metadata' ->> 'mode'
												else null
											end
										)
									)
								else null
							end,
							'toolActions',
							case
								when jsonb_typeof(message.value -> 'toolActions') = 'array'
									then message.value -> 'toolActions'
								else null
							end
						)
					)
					order by message.ordinality
				)
				from jsonb_array_elements(coalesce(legacy.chat_history, '[]'::jsonb)) with ordinality as message(value, ordinality)
			),
			'[]'::jsonb
		),
		coalesce(legacy.created_at, timezone('utc'::text, now())),
		coalesce(legacy.last_modified, legacy.created_at, timezone('utc'::text, now())),
		coalesce(legacy.last_modified, legacy.created_at, timezone('utc'::text, now()))
	from public.workspace_sessions legacy
	where not exists (
		select 1
		from public.projects project
		where project.id = legacy.id
	);
end
$$;
