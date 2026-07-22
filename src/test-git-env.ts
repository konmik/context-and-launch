const gitConfig: Record<string, string> = {
	'user.email': 'test@test.com',
	'user.name': 'Test',
	'init.defaultBranch': 'master',
	'commit.gpgsign': 'false',
	'gc.auto': '0',
	'core.editor': 'true',
};

const keys = Object.keys(gitConfig);
process.env.GIT_CONFIG_COUNT = String(keys.length);
keys.forEach((key, index) => {
	process.env[`GIT_CONFIG_KEY_${index}`] = key;
	process.env[`GIT_CONFIG_VALUE_${index}`] = gitConfig[key];
});
