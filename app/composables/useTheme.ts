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
 * The class on <html> is the single source of truth. It is put there by the boot script in
 * nuxt.config.ts before first paint, and everything here reads it rather than re-deriving
 * the preference — two sources deciding the same thing is how a theme ends up flickering.
 *
 * The pages are prerendered, so this also runs on the build machine, where there is no
 * document and no stored choice. The state therefore starts at 'light' and is reconciled
 * with the real class in onMounted. Nothing renders from it: AppHeader switches its icon
 * and label with the `dark:` variant, which is correct in the static HTML too, before any
 * JavaScript has run.
 *
 * Nothing is written to storage until someone actually toggles; until then the app keeps
 * following the OS, including when the OS switches while the tab is open.
 */
export function useTheme() {
  const theme = useState<Theme>('theme', () => 'light');

  const apply = (value: Theme) => {
    theme.value = value;
    document.documentElement.classList.toggle('dark', value === 'dark');
  };

  const toggle = () => {
    const next: Theme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';

    apply(next);

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The theme still holds for this session.
    }
  };

  const follow = (event: MediaQueryListEvent) => {
    // An explicit choice outranks the OS.
    if (!readStored()) {
      apply(event.matches ? 'dark' : 'light');
    }
  };

  let media: MediaQueryList | null = null;

  onMounted(() => {
    apply(document.documentElement.classList.contains('dark') ? 'dark' : 'light');

    media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', follow);
  });

  onUnmounted(() => media?.removeEventListener('change', follow));

  return { theme, toggle };
}
