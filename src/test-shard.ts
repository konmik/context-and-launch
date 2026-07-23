import type { it as vitestIt } from "vitest";

type TestApi = typeof vitestIt;
type Registrar = (...args: unknown[]) => unknown;
type ConditionalRegistrar = Registrar & { concurrent: unknown };

function asRegistrar(value: unknown): Registrar {
	return value as Registrar;
}

/**
 * Distributes declarations from one integration suite across test files.
 * A file may own multiple measured shards to reduce scheduling overhead
 * without changing which declarations each shard selects.
 * Every declaration is registered exactly once; the case module remains the
 * single source of truth while Vitest can schedule independent shards.
 */
export function shardTestCases(
	base: TestApi,
	shard: number | readonly number[],
	total: number,
): TestApi {
	const shards = typeof shard === "number" ? [shard] : shard;
	const invalidShard = shards.some((value) =>
		!Number.isInteger(value) || value < 0 || value >= total
	);
	if (
		!Number.isInteger(total)
		|| total <= 0
		|| shards.length === 0
		|| new Set(shards).size !== shards.length
		|| invalidShard
	) {
		throw new Error(`Invalid test shard ${shards.join(",")}/${total}.`);
	}

	let index = 0;
	const selected = (registrar: unknown): Registrar => (...args: unknown[]) => {
		const selectedForShard = shards.includes(index % total);
		index += 1;
		if (selectedForShard) return asRegistrar(registrar)(...args);
		return asRegistrar(base.skip)(...args);
	};
	const conditional = (registrar: unknown): unknown => {
		const chain = registrar as ConditionalRegistrar;
		return Object.assign(
			selected(chain),
			{ concurrent: selected(chain.concurrent) },
		);
	};

	return Object.assign(selected(base), {
		concurrent: selected(base.concurrent),
		runIf: (condition: boolean) => conditional(base.runIf(condition)),
		skipIf: (condition: boolean) => conditional(base.skipIf(condition)),
	}) as unknown as TestApi;
}
