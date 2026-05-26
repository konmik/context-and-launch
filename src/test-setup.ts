if (typeof globalThis.CSS === "undefined") {
  (globalThis as any).CSS = { escape: (v: string) => v.replace(/([^\w-])/g, "\\$1") };
}

if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
