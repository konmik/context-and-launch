import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { projectRegistry } from '$lib/server/instances.js';

export const load: PageServerLoad = async () => {
	const slug = projectRegistry.getDefaultSlug();
	if (slug) {
		redirect(302, `/project/${slug}`);
	}
	redirect(302, '/add-project');
};
