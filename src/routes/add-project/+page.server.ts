import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types.js';
import { projectRegistry } from '$lib/server/instances.js';
import { errorMessage } from '$lib/server/errors.js';

export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();
		const pathValue = (data.get('path') as string)?.trim();

		if (!pathValue) {
			return fail(400, { error: 'Path is required', path: pathValue ?? '' });
		}

		let slug: string;
		try {
			const project = projectRegistry.addProject(pathValue);
			slug = project.slug;
		} catch (e) {
			const message = errorMessage(e);
			return fail(400, { error: message, path: pathValue });
		}

		redirect(303, `/project/${slug}`);
	}
};
