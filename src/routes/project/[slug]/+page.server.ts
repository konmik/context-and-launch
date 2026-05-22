import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import {
	projectRegistry,
	boardConfigManager,
	worktreeManager,
	fileWatcher
} from '$lib/server/instances.js';
import { TicketStore } from '$lib/server/ticket-store.js';
import { errorMessage } from '$lib/server/errors.js';
import type { BoardState } from '$lib/types.js';

export const load: PageServerLoad = async ({ params }) => {
	const { slug } = params;
	projectRegistry.setLastUsed(slug);

	const projects = projectRegistry.listProjects();
	const project = projects.find((p) => p.slug === slug);

	if (!project) {
		return {
			projects,
			slug,
			board: null as BoardState | null,
			projectUnavailable: false,
			projectNotFound: true,
			projectPath: ''
		};
	}

	if (!project.available) {
		return {
			projects,
			slug,
			board: null as BoardState | null,
			projectUnavailable: true,
			projectNotFound: false,
			projectPath: project.path
		};
	}

	try {
		const worktreeDir = await worktreeManager.ensureWorktree(project.path, slug);
		fileWatcher.stopAll();
		fileWatcher.watch(worktreeDir);
		const config = boardConfigManager.getConfig();
		const tickets = new TicketStore(worktreeDir).listTickets();

		return {
			projects,
			slug,
			board: { columns: config.columns, tickets } as BoardState,
			projectUnavailable: false,
			projectNotFound: false,
			projectPath: project.path
		};
	} catch (e) {
		const message = errorMessage(e);
		return {
			projects,
			slug,
			board: null as BoardState | null,
			projectUnavailable: false,
			projectNotFound: false,
			projectPath: project.path,
			error: message
		};
	}
};

export const actions: Actions = {
	createTicket: async ({ params, request }) => {
		const data = await request.formData();
		const number = (data.get('number') as string)?.trim();
		const title = (data.get('title') as string)?.trim();

		if (!number || !title) {
			return fail(400, { ticketError: 'Number and title are required' });
		}

		try {
			const worktreeDir = worktreeManager.getWorktreeDir(params.slug);
			const firstColumn = boardConfigManager.getConfig().columns[0];
			new TicketStore(worktreeDir).createTicket(number, title, firstColumn);
			return { success: true };
		} catch (e) {
			const message = errorMessage(e);
			return fail(400, { ticketError: message });
		}
	},

	updateTicket: async ({ params, request }) => {
		const data = await request.formData();
		const folderName = data.get('folderName') as string;
		const number = data.get('number') as string | null;
		const title = data.get('title') as string | null;
		const status = data.get('status') as string | null;

		try {
			const worktreeDir = worktreeManager.getWorktreeDir(params.slug);
			new TicketStore(worktreeDir).updateTicket(
				folderName,
				number || null,
				title || null,
				status || null
			);
			return { success: true };
		} catch (e) {
			const message = errorMessage(e);
			return fail(400, { ticketError: message });
		}
	},

	deleteTicket: async ({ params, request }) => {
		const data = await request.formData();
		const folderName = data.get('folderName') as string;

		try {
			const worktreeDir = worktreeManager.getWorktreeDir(params.slug);
			new TicketStore(worktreeDir).deleteTicket(folderName);
			return { success: true };
		} catch (e) {
			const message = errorMessage(e);
			return fail(400, { ticketError: message });
		}
	},

	addProject: async ({ request }) => {
		const data = await request.formData();
		const pathValue = (data.get('path') as string)?.trim();

		if (!pathValue) {
			return fail(400, { addProjectError: 'Path is required' });
		}

		try {
			const project = projectRegistry.addProject(pathValue);
			return { addProjectSuccess: true, newSlug: project.slug };
		} catch (e) {
			const message = errorMessage(e);
			return fail(400, { addProjectError: message });
		}
	}
};
