const testGitConfig: Readonly<Record<string, string>> = {
	'user.email': 'test@test.com',
	'user.name': 'Test',
	'init.defaultBranch': 'master',
	'commit.gpgsign': 'false',
	'gc.auto': '0',
	'maintenance.auto': 'false',
	'core.fsmonitor': 'false',
	'core.editor': 'true',
};

/**
 * Merge the suite's fast, non-interactive Git settings with command-specific
 * configuration. Git's indexed environment format is replaced as a unit, so a
 * command that supplies core.longpaths cannot mask the shared test settings.
 */
export function buildTestGitEnvironment(
	environment: Readonly<Record<string, string>> = {},
): Record<string, string> {
	const config = new Map<string, string>();
	const count = Number.parseInt(environment.GIT_CONFIG_COUNT ?? '0', 10);
	for (let index = 0; index < count; index += 1) {
		const key = environment[`GIT_CONFIG_KEY_${index}`];
		const value = environment[`GIT_CONFIG_VALUE_${index}`];
		if (key !== undefined && value !== undefined) config.set(key, value);
	}
	for (const [key, value] of Object.entries(testGitConfig)) config.set(key, value);

	const merged = Object.fromEntries(
		Object.entries(environment).filter(([key]) => !/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/.test(key)),
	);
	merged.GIT_CONFIG_COUNT = String(config.size);
	Array.from(config).forEach(([key, value], index) => {
		merged[`GIT_CONFIG_KEY_${index}`] = key;
		merged[`GIT_CONFIG_VALUE_${index}`] = value;
	});
	return merged;
}

Object.assign(process.env, buildTestGitEnvironment());
