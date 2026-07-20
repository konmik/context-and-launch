import { createContext, useContext } from "solid-js";
import type { HerdrAgentStatus } from "~/core/herdr/herdr-client.js";

export type HerdrStatusLookup = (folderName: string) => HerdrAgentStatus | undefined;

export const HerdrStatusesContext = createContext<HerdrStatusLookup>();

export function useHerdrStatuses(): HerdrStatusLookup {
	const lookup = useContext(HerdrStatusesContext);
	if (!lookup) throw new Error("Herdr statuses are unavailable");
	return lookup;
}
