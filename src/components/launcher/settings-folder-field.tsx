import { pickDirectory } from "../shared/directory-picker.js";
import { errorPayload, type ErrorInfo } from "~/core/shared/errors.js";
import { ScopeBadge } from "./launcher-settings-rows.js";

export function SettingsFolderField(props: {
	label: string;
	testId: string;
	value: string;
	setValue: (value: string) => void;
	save: (value?: string) => void;
	saving: boolean;
	setError: (error: ErrorInfo | null) => void;
}) {
	return (
		<section>
			<label class="field-label" for={props.testId}>
				{props.label} <ScopeBadge scope="project" />
			</label>
			<div class="flex gap-2">
				<input
					id={props.testId}
					type="text"
					value={props.value}
					onInput={(e) => props.setValue(e.currentTarget.value)}
					onBlur={(e) => {
						if (e.relatedTarget instanceof HTMLElement
							&& e.relatedTarget.dataset.testid === `${props.testId}-browse`) return;
						props.save();
					}}
					onKeyDown={(e) => { if (e.key === "Enter") props.save(); }}
					disabled={props.saving}
					class="input input-sm flex-1"
					data-testid={`${props.testId}-input`}
				/>
				<button
					type="button"
					class="btn-secondary"
					disabled={props.saving}
					data-testid={`${props.testId}-browse`}
					onClick={async () => {
						try {
							const result = await pickDirectory(props.value);
							if ("path" in result) {
								props.setValue(result.path);
								props.save(result.path);
							} else if ("error" in result) {
								props.setError({ title: "Browse failed", description: result.error });
							}
						} catch (e) { props.setError(errorPayload(e, "Browse failed")); }
					}}
				>Browse</button>
			</div>
		</section>
	);
}
