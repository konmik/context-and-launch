declare const jsdom: {
  window: Window
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: jsdom.window.localStorage,
})
if (globalThis.CSS === undefined) {
  Object.assign(globalThis, {
    CSS: {
      escape: (v: string) => v.replace(/([^\w-])/g, '\\$1'),
    },
  })
}
if (globalThis.ResizeObserver === undefined) {
  Object.assign(globalThis, {
    ResizeObserver: function createResizeObserver(): ResizeObserver {
      return {
        observe() {},
        unobserve() {},
        disconnect() {},
      }
    },
  })
}
