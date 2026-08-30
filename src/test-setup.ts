if (globalThis.CSS === undefined) {
  Object.assign(globalThis, {
    CSS: { escape: (v: string) => v.replace(/([^\w-])/g, "\\$1") },
  });
}

if (globalThis.ResizeObserver === undefined) {
  Object.assign(globalThis, {
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
}
