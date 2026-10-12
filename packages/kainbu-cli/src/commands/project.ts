import { invokeWorkspaceApi } from '@kainbu/core';
import { loadWorkspace } from '../workspace.js';
import { createProject, renameProject } from '../writes.js';
import type { Command } from 'commander';
import { resolveContext, setActiveProject } from '../context.js';
import { printSuccess, printResult } from '../output.js';
import { ui } from '../color.js';
import { KainbuError } from '../errors.js';
import { initRuntime } from '../runtime.js';
import { resolveByIdOrName } from './shared.js';
import { resolveMember } from './task-fields.js';

const requireName = (name: string) => {
	if (!name.trim())
		throw new KainbuError('Project name cannot be empty.', {
			code: 'invalid_arguments',
			exitCode: 2
		});
	return name;
};

const formatDate = (timestamp?: number) =>
	timestamp ? new Date(timestamp).toISOString().slice(0, 10) : '';

export const registerProjectCommands = (program: Command) => {
	const project = program.command('project').alias('p').description('Manage projects');

	project
		.command('list')
		.description('List accessible projects')
		.option('--json', 'Print JSON')
		.action(async (options: { json?: boolean }) => {
			await initRuntime();
			const workspace = await loadWorkspace();
			const rows = workspace.projects.map((entry) => ({
				id: entry.id,
				name: entry.name,
				role: entry.accessRole,
				boardCount: entry.boards.length,
				pageCount: entry.pages.length,
				memberCount: entry.members.length
			}));

			printResult(
				{ json: Boolean(options.json), quiet: false },
				rows,
				rows.length
					? rows.map(
							(row) =>
								`${ui.id(row.id)}  ${ui.name(row.name)}  ${ui.meta(`(${row.boardCount} boards, ${row.pageCount} pages${row.role === 'member' ? ', shared with you' : ''})`)}`
						)
					: [ui.meta('No projects. Run: kainbu project create <name>')]
			);
		});

	project
		.command('use <target>')
		.description('Set the active project')
		.action(async (target: string) => {
			await initRuntime();
			const workspace = await loadWorkspace();
			const selected = resolveByIdOrName(workspace.projects, target, 'project');
			await setActiveProject(selected.id);
			printSuccess(
				{ projectId: selected.id, name: selected.name },
				`${ui.active('Active project:')} ${ui.name(selected.name)} ${ui.id(`(${selected.id})`)}`
			);
		});

	project
		.command('create <name>')
		.description('Create a project')
		.option('--no-use', 'Do not change the saved active project')
		.option('--json', 'Print JSON')
		.action(async (name: string, options: { json?: boolean; use?: boolean }) => {
			await initRuntime();
			const created = await createProject(requireName(name));
			if (options.use !== false) await setActiveProject(created.id);
			printSuccess(
				{ id: created.id, name: created.name },
				`${ui.success('Created project')} ${ui.name(created.name)} ${ui.id(`(${created.id})`)}`
			);
		});

	project
		.command('rename <name>')
		.description('Rename the active project (or --project)')
		.option('--project <id|name>', 'Project override')
		.option('--json', 'Print JSON')
		.action(async (name: string, options: { project?: string; json?: boolean }) => {
			await initRuntime();
			const { project: active } = await resolveContext({
				project: options.project,
				requireBoard: false,
				exact: true
			});
			await renameProject(active.id, requireName(name));
			printSuccess(
				{ id: active.id, name },
				`${ui.success('Renamed project')} ${ui.name(active.name)} ${ui.success('to')} ${ui.name(name)}`
			);
		});

	project
		.command('members')
		.description('List project members (usable with --assign / --assignee)')
		.option('--project <id|name>', 'Project override')
		.option('--json', 'Print JSON')
		.action(async (options: { project?: string; json?: boolean }) => {
			await initRuntime();
			const { project: selected } = await resolveContext({
				project: options.project,
				requireBoard: false
			});
			const rows = selected.members
				.filter((member) => !member.leftAt)
				.map((member) => ({
					userId: member.userId,
					username: member.username ?? null,
					email: member.email ?? null,
					role: member.role,
					joinedAt: member.joinedAt,
					lastOpenedAt: member.lastOpenedAt
				}));
			printResult(
				{ json: Boolean(options.json), quiet: false },
				rows,
				rows.map(
					(row) =>
						`${ui.id(row.userId)}  ${ui.name(row.username ? '@' + row.username : row.email || row.userId)}  ${ui.meta(`${row.role}${row.email && row.username ? ' · ' + row.email : ''} · joined ${formatDate(row.joinedAt)}`)}`
				)
			);
		});

	project
		.command('invite <email>')
		.description('Invite someone to the project by email (owners only)')
		.option('--project <id|name>', 'Project override')
		.action(async (email: string, options: { project?: string }) => {
			await initRuntime();
			const { project: selected } = await resolveContext({
				project: options.project,
				requireBoard: false,
				exact: true
			});
			const result = await invokeWorkspaceApi<{
				emailSent?: boolean;
				emailConfigured?: boolean;
				emailError?: string;
			}>('/api/workspace/invites/create', {
				body: { projectId: selected.id, inviteeEmail: email.trim() }
			});
			// The invitation exists either way; say plainly whether an email went out.
			const delivery = result.emailSent
				? 'email sent'
				: result.emailConfigured === false
					? 'no email sent: mail is not configured on this server'
					: `no email sent${result.emailError ? `: ${result.emailError}` : ''}`;
			printSuccess(
				{
					projectId: selected.id,
					email: email.trim(),
					emailSent: Boolean(result.emailSent),
					...(result.emailError ? { emailError: result.emailError } : {})
				},
				`${ui.success('Invited')} ${ui.name(email.trim())} ${ui.meta(`to ${selected.name} (${delivery})`)}`
			);
		});

	project
		.command('remove-member <user>')
		.description('Remove a member (owners only): @username, email, or user id')
		.option('--project <id|name>', 'Project override')
		.action(async (user: string, options: { project?: string }) => {
			await initRuntime();
			const { project: selected } = await resolveContext({
				project: options.project,
				requireBoard: false,
				exact: true
			});
			const member = await resolveMember(selected, user);
			await invokeWorkspaceApi('/api/workspace/members/remove', {
				body: { projectId: selected.id, memberUserId: member.userId }
			});
			printSuccess(
				{ projectId: selected.id, userId: member.userId, removed: true },
				`${ui.removed('Removed')} ${ui.name(member.username ? '@' + member.username : member.email || member.userId)} ${ui.meta(`from ${selected.name}`)}`
			);
		});

	project
		.command('leave <project>')
		.description('Leave a project shared with you (give its id or exact name)')
		.action(async (target: string) => {
			await initRuntime();
			const workspace = await loadWorkspace();
			const selected = resolveByIdOrName(workspace.projects, target, 'project', { exact: true });
			await invokeWorkspaceApi('/api/workspace/members/leave', {
				body: { projectId: selected.id }
			});
			printSuccess(
				{ projectId: selected.id, left: true },
				`${ui.removed('Left project')} ${ui.name(selected.name)}`
			);
		});

	const invite = program.command('invite').description('Project invitations');

	invite
		.command('list')
		.description('Invitations to you, and pending ones you sent')
		.option('--json', 'Print JSON')
		.action(async (options: { json?: boolean }) => {
			await initRuntime();
			const workspace = await loadWorkspace();
			const incoming = workspace.incomingInvites.map((entry) => ({
				id: entry.id,
				projectId: entry.projectId,
				projectName: entry.projectName,
				createdAt: entry.createdAt
			}));
			const outgoing = workspace.projects.flatMap((entry) =>
				(entry.invites || [])
					.filter((sent) => sent.status === 'pending')
					.map((sent) => ({
						id: sent.id,
						projectId: entry.id,
						projectName: entry.name,
						email: sent.inviteeEmail,
						createdAt: sent.createdAt
					}))
			);
			printResult({ json: Boolean(options.json), quiet: false }, { incoming, outgoing }, [
				ui.heading(`For you (${incoming.length})`),
				...incoming.map(
					(entry) => `  ${ui.id(entry.id)}  ${ui.name(entry.projectName || entry.projectId)}`
				),
				ui.heading(`Sent, pending (${outgoing.length})`),
				...outgoing.map(
					(entry) => `  ${ui.id(entry.id)}  ${ui.name(entry.email)}  ${ui.meta(entry.projectName)}`
				)
			]);
		});

	for (const [name, accept] of [
		['accept', true],
		['decline', false]
	] as const)
		invite
			.command(`${name} <inviteId>`)
			.description(`${accept ? 'Accept' : 'Decline'} an invitation to you`)
			.action(async (inviteId: string) => {
				await initRuntime();
				await invokeWorkspaceApi('/api/workspace/invites/respond', {
					body: { inviteId: inviteId.trim(), accept }
				});
				printSuccess(
					{ inviteId: inviteId.trim(), accepted: accept },
					accept ? ui.success('Invitation accepted') : ui.removed('Invitation declined')
				);
			});

	invite
		.command('cancel <inviteId>')
		.description('Cancel an invitation you sent')
		.action(async (inviteId: string) => {
			await initRuntime();
			await invokeWorkspaceApi('/api/workspace/invites/cancel', {
				body: { inviteId: inviteId.trim() }
			});
			printSuccess(
				{ inviteId: inviteId.trim(), cancelled: true },
				ui.removed('Invitation cancelled')
			);
		});
};
