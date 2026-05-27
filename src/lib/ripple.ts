export function initRipple() {
  const onPointerDown = (e: PointerEvent) => {
    const target = (e.target as HTMLElement).closest(
      "button, [role='button'], [data-ripple], .ripple"
    ) as HTMLElement | null;
    if (!target) return;

    // Ark UI buttons carry [data-scope] and are excluded from the ripple
    // container styles in CSS, so ensure the host clips and anchors the ripple.
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
