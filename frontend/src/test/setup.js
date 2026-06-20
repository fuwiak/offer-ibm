const store = new Map();

const localStorageMock = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => {
    store.set(key, String(value));
  },
  removeItem: (key) => {
    store.delete(key);
  },
  clear: () => {
    store.clear();
  },
};

globalThis.localStorage = localStorageMock;
globalThis.window = globalThis.window ?? {};
globalThis.window.localStorage = localStorageMock;
