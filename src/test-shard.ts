import type { it as vitestIt } from "vitest";

type TestApi = typeof vitestIt;
type Registrar = TestApi["concurrent"];
type RegistrarCall = (...args: Parameters<Registrar>) => ReturnType<Registrar>;
type ConditionalRegistrar = RegistrarCall & { concurrent: RegistrarCall };

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
	const shards = Array.isArray(shard) ? shard : [shard];
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
	const selected = (registrar: Registrar): RegistrarCall => (...args: Parameters<Registrar>) => {
		const selectedForShard = shards.includes(index % total);
		index += 1;
		if (selectedForShard) return registrar(...args);
		return base.skip(...args);
	};
	const conditional = (registrar: Registrar): ConditionalRegistrar => Object.assign(
		selected(registrar),
		{ concurrent: selected(registrar.concurrent) },
	);

	return Object.assign(selected(base), base, {
		concurrent: selected(base.concurrent),
		runIf: (condition: boolean) => conditional(base.runIf(condition)),
		skipIf: (condition: boolean) => conditional(base.skipIf(condition)),
	});
}
