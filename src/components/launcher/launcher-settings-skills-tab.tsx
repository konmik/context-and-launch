import { Show, For } from "solid-js";
import { DragDropProvider, DragDropSensors, SortableProvider, closestCenter } from "@thisbeyond/solid-dnd";
import { TabsContent } from "../ui/tabs";
import type { MergedLauncherConfig } from "~/server/launcher/launcher-config.js";
import { NameDragOverlay } from "../board/dnd-shared.js";
import type { ListReorder } from "../board/list-reorder.js";
import { SortableSkillRow, SkillDropPreview, type MergedSkill } from "./launcher-settings-rows.js";
import type { ItemType, Scope } from "./launcher-settings-dialogs.js";

export function SkillsTab(props: {
	config: MergedLauncherConfig;
	skillReorder: ListReorder<MergedSkill>;
	startAdd: (itemType: ItemType) => void;
	startEdit: (itemType: ItemType, scope: Scope, name: string, text: string) => void;
	deleteItem: (itemType: ItemType, scope: Scope, name: string) => void;
}) {
	return (
		<TabsContent value="skills">
			<div class="space-y-6">
				<section>
					<div class="mb-2 flex items-center justify-between">
						<h3 class="text-sm font-semibold">Skills</h3>
						<button onClick={() => props.startAdd("skill")} class="btn-primary btn-sm">Add</button>
					</div>
					<Show
						when={props.config.skills.length > 0}
						fallback={
							<p class="py-3 text-center text-sm text-muted-foreground">
								No skills configured.
							</p>
						}
					>
						<DragDropProvider
							onDragStart={props.skillReorder.onDragStart}
							onDragOver={props.skillReorder.onDragOver}
							onDragEnd={props.skillReorder.onDragEnd}
							collisionDetector={closestCenter}
						>
							<DragDropSensors />
							<SortableProvider ids={props.config.skills.map(s => s.name)}>
								<div class="space-y-2">
									<For each={props.config.skills}>
										{(skill, i) => (
											<>
												<Show when={props.skillReorder.dropPreview()?.insertBefore === i()}>
													<SkillDropPreview skill={props.skillReorder.dropPreview()!.item} />
												</Show>
												<SortableSkillRow
													skill={skill}
													isActive={props.skillReorder.activeId() === skill.name}
													onEdit={() => props.startEdit(
														"skill", skill.scope, skill.name, skill.text,
													)}
													onDelete={() => props.deleteItem(
														"skill", skill.scope, skill.name,
													)}
												/>
											</>
										)}
									</For>
									<Show when={
										props.skillReorder.dropPreview()?.insertBefore
											=== props.config.skills.length
									}>
										<SkillDropPreview
											skill={props.skillReorder.dropPreview()!.item}
										/>
									</Show>
								</div>
							</SortableProvider>
							<NameDragOverlay nameOf={
								(id) => props.config.skills.find(s => s.name === id)?.name
							} />
						</DragDropProvider>
					</Show>
					<Show when={props.config.skills.some(s => s.scope === "app")}>
						<p
							class="mt-2 text-xs text-muted-foreground"
							data-testid="skill-order-warning"
						>
							Skill order is shared. User skills appear in every project,
							so reordering one here changes its position in all of them.
						</p>
					</Show>
				</section>
			</div>
		</TabsContent>
	);
}
