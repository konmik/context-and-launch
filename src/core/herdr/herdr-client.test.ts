import { describe, it, expect } from 'vitest';
import {
	fetchHerdrTicketStatuses, parseHerdrAgentList, ticketStatusesFromAgents,
	usesHerdrLaunchTarget, type HerdrCommandRunner,
} from './herdr-client.js';
import { ProcessError } from '../shared/errors.js';

const WORKING_JSON = '{"id":"test","result":{"type":"agent_list","agents":'
	+ '[{"workspace_id":"w1","pane_id":"w1:p2","name":'
	+ '"alpha--st-47-herdr","agent_status":"working"}]}}';

const UNNAMED_JSON = '{"id":"test","result":{"type":"agent_list","agents":'
	+ '[{"workspace_id":"w1","pane_id":"w1:p2","agent_status":"working"}]}}';

function runner(result: { exitCode?: number; stdout?: string; stderr?: string }): HerdrCommandRunner {
	return async () => ({
		exitCode: result.exitCode ?? 0,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
	});
}

describe('fetchHerdrTicketStatuses', () => {
	it('parses the pinned JSON shape into folder-name statuses', async () => {
		const statuses = await fetchHerdrTicketStatuses('alpha', runner({ stdout: WORKING_JSON }));
		expect(statuses).toEqual({ 'st-47-herdr': 'working' });
	});

	it('skips unnamed agents', async () => {
		const statuses = await fetchHerdrTicketStatuses('alpha', runner({ stdout: UNNAMED_JSON }));
		expect(statuses).toEqual({});
	});

	it('skips agents from other projects', async () => {
		const json = '{"result":{"agents":[{"name":"beta--st-9","agent_status":"working"}]}}';
		const statuses = await fetchHerdrTicketStatuses('alpha', runner({ stdout: json }));
		expect(statuses).toEqual({});
	});

	it('keeps the done status', async () => {
		const json = '{"result":{"agents":[{"name":"alpha--st-2","agent_status":"done"}]}}';
		const statuses = await fetchHerdrTicketStatuses('alpha', runner({ stdout: json }));
		expect(statuses).toEqual({ 'st-2': 'done' });
	});

	it('maps an out-of-vocabulary status to unknown', async () => {
		const json = '{"result":{"agents":[{"name":"alpha--st-1","agent_status":"frobnicating"}]}}';
		const statuses = await fetchHerdrTicketStatuses('alpha', runner({ stdout: json }));
		expect(statuses).toEqual({ 'st-1': 'unknown' });
	});

	it('throws on non-JSON stdout', async () => {
		await expect(fetchHerdrTicketStatuses('alpha', runner({ stdout: 'not json' })))
			.rejects.toThrow();
	});

	it('throws on missing result.agents', async () => {
		await expect(fetchHerdrTicketStatuses('alpha', runner({ stdout: '{"result":{}}' })))
			.rejects.toThrow('Unexpected herdr agent list output');
	});

	it('throws ProcessError with stderr when exit code is nonzero', async () => {
		const promise = fetchHerdrTicketStatuses('alpha', runner({ exitCode: 1, stderr: 'boom' }));
		await expect(promise).rejects.toBeInstanceOf(ProcessError);
		await expect(promise).rejects.toThrow('boom');
	});
});

describe('parseHerdrAgentList', () => {
	it('keeps unnamed entries with undefined name', () => {
		const agents = parseHerdrAgentList(UNNAMED_JSON);
		expect(agents).toEqual([{ name: undefined, agentStatus: 'working' }]);
	});
});

describe('ticketStatusesFromAgents', () => {
	it('lets later duplicates overwrite earlier ones', () => {
		const statuses = ticketStatusesFromAgents([
			{ name: 'alpha--st-1', agentStatus: 'idle' },
			{ name: 'alpha--st-1', agentStatus: 'working' },
		], 'alpha');
		expect(statuses).toEqual({ 'st-1': 'working' });
	});
});

describe('usesHerdrLaunchTarget', () => {
	it('is true for the default Herdr profile command', () => {
		expect(usesHerdrLaunchTarget(
			'powershell -File {{configDefaultsDir}}/run-agent-herdr.ps1 ...',
		)).toBe(true);
	});

	it('is false for non-Herdr commands', () => {
		expect(usesHerdrLaunchTarget('powershell -File run-agent.ps1')).toBe(false);
		expect(usesHerdrLaunchTarget('bash run-agent.sh')).toBe(false);
	});
});
