export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'add-stamp:theme';

const readStored = (): Theme | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    // Private mode, or storage denied.
    return null;
  }
};

/**
 * Light/dark, stored per browser.
 *
 * The class on <html> is put there by the boot script in nuxt.config.ts before first paint,
 * so this reads the DOM rather than re-deriving the preference — two sources deciding the
 * same thing is how a theme ends up flickering on load. The app runs with ssr: false, so
 * the document exists by the time this initialiser runs.
 *
 * Nothing is written to storage until someone actually toggles; until then the app keeps
 * following the OS, including when the OS switches while the tab is open.
 */
export function useTheme() {
  const theme = useState<Theme>('theme', () =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );

  const apply = (value: Theme) => {
    theme.value = value;
    document.documentElement.classList.toggle('dark', value === 'dark');
  };

  const toggle = () => {
    const next: Theme = theme.value === 'dark' ? 'light' : 'dark';

    apply(next);

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The theme still holds for this session.
    }
  };

  const media = window.matchMedia('(prefers-color-scheme: dark)');

  const follow = (event: MediaQueryListEvent) => {
    // An explicit choice outranks the OS.
    if (!readStored()) {
      apply(event.matches ? 'dark' : 'light');
    }
  };

  onMounted(() => media.addEventListener('change', follow));
  onUnmounted(() => media.removeEventListener('change', follow));

  return { theme, toggle };
}
