import * as v from 'valibot';
import type { JsonValue } from '../shared/json.js';

export interface ProjectEntry {
	path: string;
	projectSlug: string;
	name?: string;
	branch?: string;
	ticketsPath?: string;
	mainBranch?: string;
	boardId?: string;
}

export interface AppConfigData {
	projects: ProjectEntry[];
	lastUsedProjectSlug: string | null;
	lastUsedProfileName: string | null;
	port?: number;
	browser?: string;
}

const ProjectEntrySchema = v.looseObject({
	path: v.string(),
	projectSlug: v.optional(v.string()),
	slug: v.optional(v.string()),
	name: v.optional(v.string()),
	branch: v.optional(v.string()),
	ticketsPath: v.optional(v.string()),
	mainBranch: v.optional(v.string()),
	boardId: v.optional(v.string()),
});

const AppConfigSchema = v.looseObject({
	projects: v.array(ProjectEntrySchema),
	lastUsedProjectSlug: v.optional(v.nullable(v.string())),
	lastUsedSlug: v.optional(v.nullable(v.string())),
	lastUsedProfileName: v.optional(v.nullable(v.string())),
	port: v.optional(v.pipe(v.number(), v.finite())),
	browser: v.optional(v.string()),
});

export function decodeAppConfig(raw: JsonValue) {
	const parsed = v.parse(AppConfigSchema, raw);
	const { lastUsedSlug, ...config } = parsed;
	return {
		legacy: lastUsedSlug !== undefined || parsed.projects.some(project => project.slug !== undefined),
		config: {
			...config,
			projects: parsed.projects.map(({ slug, ...entry }) => {
				const projectSlug = entry.projectSlug ?? slug;
				if (projectSlug === undefined) throw new Error('Invalid config.json: project is missing projectSlug');
				return { ...entry, projectSlug };
			}),
			lastUsedProjectSlug: parsed.lastUsedProjectSlug ?? lastUsedSlug ?? null,
			lastUsedProfileName: parsed.lastUsedProfileName ?? null,
		} satisfies AppConfigData,
	};
}
