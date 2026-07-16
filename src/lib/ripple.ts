export function initRipple() {
  const onPointerDown = (e: PointerEvent) => {
    const target = (e.target as HTMLElement).closest(
      ".btn-primary, .btn-secondary, .btn-destructive, .btn-icon, [data-ripple], .ripple"
    ) as HTMLElement | null;
    if (!target) return;

    // The host must clip and anchor the ripple; applied at fire time so the
    // selector list is not duplicated in CSS.
    if (getComputedStyle(target).position === "static") target.style.position = "relative";
    target.style.overflow = "hidden";

    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    const ripple = document.createElement("span");
    ripple.className = "ripple-effect";
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    target.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  };

  document.addEventListener("pointerdown", onPointerDown);
  return () => document.removeEventListener("pointerdown", onPointerDown);
}
