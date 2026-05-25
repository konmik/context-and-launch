import { createSignal, createEffect, on, onCleanup, type JSX } from "solid-js";
import { Portal } from "solid-js/web";

const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;
const MAX_SCREEN_FRACTION = 0.9;

function clamp(width: number, height: number) {
  const maxW = Math.floor(window.innerWidth * MAX_SCREEN_FRACTION);
  const maxH = Math.floor(window.innerHeight * MAX_SCREEN_FRACTION);
  return {
    width: Math.max(MIN_WIDTH, Math.min(width, maxW)),
    height: Math.max(MIN_HEIGHT, Math.min(height, maxH)),
  };
}

function clampPosition(x: number, y: number, w: number, h: number) {
  const maxX = window.innerWidth - w;
  const maxY = window.innerHeight - h;
  return {
    x: Math.max(0, Math.min(x, maxX)),
    y: Math.max(0, Math.min(y, maxY)),
  };
}

function loadState(key: string) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as { width: number; height: number; x?: number; y?: number };
  } catch {
    localStorage.removeItem(key);
  }
  return null;
}

function saveState(key: string, width: number, height: number, x: number, y: number) {
  localStorage.setItem(key, JSON.stringify({ width, height, x, y }));
}

interface ResizableWindowProps {
  open: boolean;
  onClose: () => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  storageKey: string;
  defaultWidth?: number;
  defaultHeight?: number;
  title: JSX.Element;
  children: JSX.Element;
  footer?: JSX.Element;
}

type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export default function ResizableWindow(props: ResizableWindowProps) {
  const [width, setWidth] = createSignal(props.defaultWidth ?? 768);
  const [height, setHeight] = createSignal(props.defaultHeight ?? 600);
  const [posX, setPosX] = createSignal(0);
  const [posY, setPosY] = createSignal(0);
  const [positioned, setPositioned] = createSignal(false);

  function center(w: number, h: number) {
    setPosX(Math.floor((window.innerWidth - w) / 2));
    setPosY(Math.floor((window.innerHeight - h) / 2));
  }

  createEffect(
    on(
      () => props.open,
      (open) => {
        if (!open) {
          setPositioned(false);
          return;
        }
        const saved = loadState(props.storageKey);
        const clamped = clamp(
          saved?.width ?? props.defaultWidth ?? 768,
          saved?.height ?? props.defaultHeight ?? Math.floor(window.innerHeight * 0.8),
        );
        setWidth(clamped.width);
        setHeight(clamped.height);
        if (saved?.x != null && saved?.y != null) {
          const pos = clampPosition(saved.x, saved.y, clamped.width, clamped.height);
          setPosX(pos.x);
          setPosY(pos.y);
        } else {
          center(clamped.width, clamped.height);
        }
        setPositioned(true);
      },
    ),
  );

  function startDrag(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPosX = posX();
    const startPosY = posY();

    function onMouseMove(ev: MouseEvent) {
      const pos = clampPosition(
        startPosX + (ev.clientX - startX),
        startPosY + (ev.clientY - startY),
        width(),
        height(),
      );
      setPosX(pos.x);
      setPosY(pos.y);
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      saveState(props.storageKey, width(), height(), posX(), posY());
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function startResize(edge: Edge, e: MouseEvent) {
    e.preventDefault();
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startW = width();
    const startH = height();
    const startPX = posX();
    const startPY = posY();

    const resizesRight = edge.includes("e");
    const resizesLeft = edge.includes("w");
    const resizesDown = edge.includes("s");
    const resizesUp = edge.includes("n");

    function onMouseMove(ev: MouseEvent) {
      const dx = ev.clientX - startMouseX;
      const dy = ev.clientY - startMouseY;

      let newW = startW;
      let newH = startH;
      if (resizesRight) newW = startW + dx;
      if (resizesLeft) newW = startW - dx;
      if (resizesDown) newH = startH + dy;
      if (resizesUp) newH = startH - dy;

      const clamped = clamp(newW, newH);
      setWidth(clamped.width);
      setHeight(clamped.height);

      if (resizesLeft) {
        const actualDw = startW - clamped.width;
        setPosX(startPX + actualDw);
      }
      if (resizesUp) {
        const actualDh = startH - clamped.height;
        setPosY(startPY + actualDh);
      }
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      saveState(props.storageKey, width(), height(), posX(), posY());
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (props.onKeyDown) {
      props.onKeyDown(e);
      if (e.defaultPrevented) return;
    }
    if (e.key === "Escape") {
      props.onClose();
    }
  }

  createEffect(() => {
    if (props.open && positioned()) {
      document.addEventListener("keydown", handleKeydown);
    } else {
      document.removeEventListener("keydown", handleKeydown);
    }
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeydown);
  });

  return (
    <>
      {props.open && positioned() && (
        <Portal>
        <div class="fixed inset-0 bg-black/50">
          <div class="fixed inset-0" onMouseDown={(e) => e.preventDefault()} onClick={props.onClose} />
          <div
            class="absolute flex flex-col rounded-lg border border-border bg-card shadow-lg"
            style={{
              width: `${width()}px`,
              height: `${height()}px`,
              left: `${posX()}px`,
              top: `${posY()}px`,
            }}
          >
            <div
              class="shrink-0 cursor-move select-none border-b border-border p-4"
              onMouseDown={startDrag}
            >
              {props.title}
            </div>

            <div class="flex-1 overflow-hidden">{props.children}</div>

            {props.footer && (
              <div class="shrink-0 border-t border-border p-4">{props.footer}</div>
            )}

            {/* Edge handles */}
            <div onMouseDown={[startResize, "n"]} class="absolute top-0 left-2 right-2 h-1.5 cursor-n-resize" />
            <div onMouseDown={[startResize, "s"]} class="absolute bottom-0 left-2 right-2 h-1.5 cursor-s-resize" />
            <div onMouseDown={[startResize, "w"]} class="absolute left-0 top-2 bottom-2 w-1.5 cursor-w-resize" />
            <div onMouseDown={[startResize, "e"]} class="absolute right-0 top-2 bottom-2 w-1.5 cursor-e-resize" />
            {/* Corner handles */}
            <div onMouseDown={[startResize, "nw"]} class="absolute top-0 left-0 h-3 w-3 cursor-nw-resize" />
            <div onMouseDown={[startResize, "ne"]} class="absolute top-0 right-0 h-3 w-3 cursor-ne-resize" />
            <div onMouseDown={[startResize, "sw"]} class="absolute bottom-0 left-0 h-3 w-3 cursor-sw-resize" />
            <div onMouseDown={[startResize, "se"]} class="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize" />
          </div>
        </div>
        </Portal>
      )}
    </>
  );
}
