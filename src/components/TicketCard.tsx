import { For, Show, createSignal } from "solid-js";
import type { TicketInfo } from "~/types.js";

interface TicketCardProps {
  ticket: TicketInfo;
  columns: string[];
  onEdit: (ticket: TicketInfo) => void;
  onDelete: (ticket: TicketInfo) => void;
  onViewDetail: (ticket: TicketInfo) => void;
  onMoveTo: (ticket: TicketInfo, status: string) => void;
}

export default function TicketCard(props: TicketCardProps) {
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [moveMenuOpen, setMoveMenuOpen] = createSignal(false);
  const [menuSide, setMenuSide] = createSignal<"right" | "left">("right");
  let menuBtnRef: HTMLButtonElement | undefined;

  function handleCardClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-menu]")) return;
    props.onViewDetail(props.ticket);
  }

  function handleMenuClick(e: MouseEvent) {
    e.stopPropagation();
    if (!menuOpen() && menuBtnRef) {
      const rect = menuBtnRef.getBoundingClientRect();
      const spaceRight = window.innerWidth - rect.right;
      setMenuSide(spaceRight >= 160 ? "right" : "left");
    }
    setMenuOpen(!menuOpen());
    setMoveMenuOpen(false);
  }

  return (
    <div
      class="ripple cursor-pointer rounded-md border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
      onClick={handleCardClick}
    >
      <div class="mb-1 flex items-start justify-between">
        <span class="text-sm font-medium text-primary">{props.ticket.number}</span>
        <div class="relative" data-menu>
          <button
            ref={(el) => (menuBtnRef = el)}
            class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={handleMenuClick}
            aria-label="Ticket actions"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </button>
          <Show when={menuOpen()}>
            <div
              class="fixed inset-0 z-40"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                setMoveMenuOpen(false);
              }}
            />
            <div class={`absolute top-0 z-50 min-w-[150px] rounded-md border border-border bg-popover py-1 shadow-md ${menuSide() === "right" ? "left-full ml-1" : "right-full mr-1"}`}>
              <div class="relative">
                <button
                  class="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMoveMenuOpen(!moveMenuOpen());
                  }}
                >
                  Move to...
                </button>
                <Show when={moveMenuOpen()}>
                  <div class="absolute left-full top-0 min-w-[120px] rounded-md border border-border bg-popover py-1 shadow-md">
                    <For each={props.columns.filter((c) => c !== props.ticket.status)}>
                      {(col) => (
                        <button
                          class="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpen(false);
                            setMoveMenuOpen(false);
                            props.onMoveTo(props.ticket, col);
                          }}
                        >
                          {col}
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
              <button
                class="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  props.onEdit(props.ticket);
                }}
              >
                Edit
              </button>
              <button
                class="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  props.onDelete(props.ticket);
                }}
              >
                Delete
              </button>
            </div>
          </Show>
        </div>
      </div>
      <p class="line-clamp-2 text-sm">{props.ticket.title}</p>
    </div>
  );
}
