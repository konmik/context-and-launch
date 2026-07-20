import { describe, it, expect } from 'vitest';
import {
	fetchHerdrTicketStatuses, ticketStatusesFromAgents, usesHerdrLaunchTarget,
} from './herdr-client.js';
import type { HerdrExecFn } from './herdr-exec.js';
import { ProcessError } from '../shared/errors.js';

const WORKING_JSON = '{"id":"test","result":{"type":"agent_list","agents":'
	+ '[{"workspace_id":"w1","pane_id":"w1:p2","name":'
	+ '"alpha--st-47-herdr","agent_status":"working"}]}}';

const UNNAMED_JSON = '{"id":"test","result":{"type":"agent_list","agents":'
	+ '[{"workspace_id":"w1","pane_id":"w1:p2","agent_status":"working"}]}}';

function execReturning(stdout: string): HerdrExecFn {
	return async () => stdout;
}

describe('fetchHerdrTicketStatuses', () => {
	it('parses the pinned JSON shape into folder-name statuses', async () => {
		const statuses = await fetchHerdrTicketStatuses('alpha', execReturning(WORKING_JSON));
		expect(statuses).toEqual({ 'st-47-herdr': 'working' });
	});

	it('skips unnamed agents', async () => {
		const statuses = await fetchHerdrTicketStatuses('alpha', execReturning(UNNAMED_JSON));
		expect(statuses).toEqual({});
	});

	it('skips agents from other projects', async () => {
		const json = '{"result":{"agents":[{"name":"beta--st-9","agent_status":"working"}]}}';
		const statuses = await fetchHerdrTicketStatuses('alpha', execReturning(json));
		expect(statuses).toEqual({});
	});

	it('keeps the done status', async () => {
		const json = '{"result":{"agents":[{"name":"alpha--st-2","agent_status":"done"}]}}';
		const statuses = await fetchHerdrTicketStatuses('alpha', execReturning(json));
		expect(statuses).toEqual({ 'st-2': 'done' });
	});

	it('passes an out-of-vocabulary status through verbatim', async () => {
		const json = '{"result":{"agents":[{"name":"alpha--st-1","agent_status":"frobnicating"}]}}';
		const statuses = await fetchHerdrTicketStatuses('alpha', execReturning(json));
		expect(statuses).toEqual({ 'st-1': 'frobnicating' });
	});

	it('throws on non-JSON output', async () => {
		await expect(fetchHerdrTicketStatuses('alpha', execReturning('not json')))
			.rejects.toThrow("Could not parse JSON output from 'herdr agent list'.");
	});

	it('throws on missing result.agents', async () => {
		await expect(fetchHerdrTicketStatuses('alpha', execReturning('{"result":{}}')))
			.rejects.toThrow("Missing agents array in output from 'herdr agent list'.");
	});

	it('propagates a nonzero-exit ProcessError from exec', async () => {
		const exec: HerdrExecFn = async () => {
			throw new ProcessError('herdr agent list', 1, 'boom');
		};
		const promise = fetchHerdrTicketStatuses('alpha', exec);
		await expect(promise).rejects.toBeInstanceOf(ProcessError);
		await expect(promise).rejects.toThrow('boom');
	});
});

describe('ticketStatusesFromAgents', () => {
	it('lets later duplicates overwrite earlier ones', () => {
		const statuses = ticketStatusesFromAgents([
			{ name: 'alpha--st-1', agent_status: 'idle' },
			{ name: 'alpha--st-1', agent_status: 'working' },
		], 'alpha');
		expect(statuses).toEqual({ 'st-1': 'working' });
	});

	it('skips agents without a string agent_status', () => {
		const statuses = ticketStatusesFromAgents([{ name: 'alpha--st-1' }], 'alpha');
		expect(statuses).toEqual({});
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
