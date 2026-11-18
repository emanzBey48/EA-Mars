// UI language belongs to the view layer. Keep the choice local to this app instance.
export function createUiLanguage(initial = 'tr') {
  let locale = initial === 'en' ? 'en' : 'tr';
  const listeners = new Set();
  return {
    get: () => locale,
    set(next) {
      const value = next === 'en' ? 'en' : 'tr';
      if (value === locale) return;
      locale = value;
      for (const listener of listeners) listener(locale);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
