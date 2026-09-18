interface PageSeo {
  /** The whole <title>, not a fragment — no site name is appended for you. */
  title: string;

  /** One sentence, under ~155 characters, or search engines will cut it mid-word. */
  description: string;

  /** Route path, leading slash, no host. The canonical and og:url are built from it. */
  path: string;

  /** Overrides the default share card. Absolute, or a path from the site root. */
  image?: string;
}

/**
 * The per-page half of the head: title, description, canonical, and the Open Graph and
 * Twitter pairs that go with them.
 *
 * The constants — og:site_name, og:locale, twitter:card, the icons — live in nuxt.config
 * and are not repeated here.
 *
 * Every URL comes out absolute against runtimeConfig.public.siteUrl. A relative canonical
 * resolves against whatever host served the page, which on a preview deploy means the
 * preview declares itself canonical and competes with production for the same content.
 */
export function usePageSeo({ title, description, path, image = '/og-image.png' }: PageSeo) {
  const siteUrl = useRuntimeConfig().public.siteUrl as string;

  const absolute = (value: string) => (value.startsWith('http') ? value : `${siteUrl}${value}`);

  const url = absolute(path);
  const imageUrl = absolute(image);

  useSeoMeta({
    title,
    description,
    ogTitle: title,
    ogDescription: description,
    ogType: 'website',
    ogUrl: url,
    ogImage: imageUrl,
    ogImageWidth: 1200,
    ogImageHeight: 630,
    ogImageAlt: 'Add Stamp — batch watermarking, entirely in your browser',
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: imageUrl
  });

  useHead({
    link: [{ rel: 'canonical', href: url }]
  });
}
