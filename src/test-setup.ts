if (globalThis.CSS === undefined) {
  (globalThis as any).CSS = { escape: (v: string) => v.replace(/([^\w-])/g, "\\$1") };
}

if (globalThis.ResizeObserver === undefined) {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
