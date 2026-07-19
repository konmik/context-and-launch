import { Show } from "solid-js";
import { resolveStatusSwatch, type SwatchColumn } from "~/core/board/status-swatch.js";

export default function StatusSwatch(props: { status: string; columns: SwatchColumn[] }) {
  const appearance = () => resolveStatusSwatch(props.status, props.columns);
  const hex = () => {
    const current = appearance();
    return current.kind === "column-color" ? current.hex : undefined;
  };
  return (
    <Show when={appearance().kind !== "none"}>
      <span
        data-testid="status-swatch"
        data-status={props.status}
        title={props.status}
        classList={{
          "inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]": true,
          "bg-destructive": appearance().kind === "orphan-status",
        }}
        style={{ "background-color": hex() }}
      />
    </Show>
  );
}
