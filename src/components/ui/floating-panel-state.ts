import { createSignal, onCleanup, untrack } from "solid-js";

export type FloatingPanelSize = { width: number; height: number };
export type FloatingPanelPosition = { x: number; y: number };

type Rect = { position: FloatingPanelPosition; size: FloatingPanelSize };

export function constrainFloatingPanelRect(
  rect: Rect,
  viewport: FloatingPanelSize,
  minSize: FloatingPanelSize,
  maxSize?: FloatingPanelSize,
): Rect {
  const maximum = {
    width: Math.min(viewport.width, maxSize?.width ?? viewport.width),
    height: Math.min(viewport.height, maxSize?.height ?? viewport.height),
  };
  const minimum = {
    width: Math.min(minSize.width, maximum.width),
    height: Math.min(minSize.height, maximum.height),
  };
  const size = {
    width: Math.min(maximum.width, Math.max(minimum.width, rect.size.width)),
    height: Math.min(maximum.height, Math.max(minimum.height, rect.size.height)),
  };
  return {
    size,
    position: {
      x: Math.min(Math.max(0, rect.position.x), Math.max(0, viewport.width - size.width)),
      y: Math.min(Math.max(0, rect.position.y), Math.max(0, viewport.height - size.height)),
    },
  };
}

export function resizeFloatingPanelRect(
  rect: Rect,
  delta: FloatingPanelSize,
  viewport: FloatingPanelSize,
  minSize: FloatingPanelSize,
  maxSize?: FloatingPanelSize,
): Rect {
  const available = {
    width: viewport.width - rect.position.x,
    height: viewport.height - rect.position.y,
  };
  return constrainFloatingPanelRect(
    {
      position: rect.position,
      size: { width: rect.size.width + delta.width, height: rect.size.height + delta.height },
    },
    viewport,
    minSize,
    {
      width: Math.min(available.width, maxSize?.width ?? available.width),
      height: Math.min(available.height, maxSize?.height ?? available.height),
    },
  );
}

export function createFloatingPanelState(options: {
  initialPosition: FloatingPanelPosition;
  initialSize: FloatingPanelSize;
  minSize: () => FloatingPanelSize;
  maxSize: () => FloatingPanelSize | undefined;
  viewport: () => FloatingPanelSize;
  onPositionChangeEnd?: (position: FloatingPanelPosition) => void;
  onSizeChangeEnd?: (size: FloatingPanelSize) => void;
}) {
  const initialRect = () => constrainFloatingPanelRect(
    { position: options.initialPosition, size: options.initialSize },
    options.viewport(), options.minSize(), options.maxSize(),
  );
  const initial = initialRect();
  const [position, setPosition] = createSignal(initial.position);
  const [size, setSize] = createSignal(initial.size);
  let stopGesture: ((commit: boolean) => void) | undefined;

  function constrain() {
    const next = untrack(() => constrainFloatingPanelRect(
      { position: position(), size: size() },
      options.viewport(), options.minSize(), options.maxSize(),
    ));
    setPosition(next.position);
    setSize(next.size);
  }

  function reset() {
    const next = initialRect();
    setPosition(next.position);
    setSize(next.size);
  }

  function startGesture(event: PointerEvent, resizing: boolean) {
    stopGesture?.(false);
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    const origin = {
      pointer: { x: event.clientX, y: event.clientY },
      position: position(), size: size(),
    };
    event.preventDefault();
    target.setPointerCapture(event.pointerId);

    const move = (next: PointerEvent) => {
      if (next.pointerId !== event.pointerId) return;
      const dx = next.clientX - origin.pointer.x;
      const dy = next.clientY - origin.pointer.y;
      const rect = resizing
        ? resizeFloatingPanelRect(
          { position: origin.position, size: origin.size },
          { width: dx, height: dy },
          options.viewport(), options.minSize(), options.maxSize(),
        )
        : constrainFloatingPanelRect(
          { position: { x: origin.position.x + dx, y: origin.position.y + dy }, size: origin.size },
          options.viewport(), options.minSize(), options.maxSize(),
        );
      setPosition(rect.position);
      setSize(rect.size);
    };
    const finish = (commit: boolean) => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", pointerUp);
      target.removeEventListener("pointercancel", pointerCancel);
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
      stopGesture = undefined;
      if (!commit) {
        setPosition(origin.position);
        setSize(origin.size);
        return;
      }
      if (resizing) options.onSizeChangeEnd?.(size());
      else options.onPositionChangeEnd?.(position());
    };
    const pointerUp = (next: PointerEvent) => {
      if (next.pointerId === event.pointerId) finish(true);
    };
    const pointerCancel = (next: PointerEvent) => {
      if (next.pointerId === event.pointerId) finish(false);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", pointerUp);
    target.addEventListener("pointercancel", pointerCancel);
    stopGesture = finish;
  }

  function cancelGesture() {
    if (!stopGesture) return false;
    stopGesture(false);
    return true;
  }

  onCleanup(() => stopGesture?.(false));
  return {
    position, size, constrain, reset,
    startMove: (event: PointerEvent) => startGesture(event, false),
    startResize: (event: PointerEvent) => startGesture(event, true),
    cancelGesture,
  };
}
