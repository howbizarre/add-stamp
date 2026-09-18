/**
 * The sitemap, written out at build time — it is in nitro.prerender.routes, so what ships
 * is a static file, not a function invocation per crawl.
 *
 * Two pages do not need a sitemap module and its build-time dependency. They do need the
 * list to stay honest, which is why it sits next to nothing else.
 */
const PAGES = [
  { path: '/', changefreq: 'monthly', priority: '1.0' },
  { path: '/how-to-use', changefreq: 'monthly', priority: '0.8' }
];

export default defineEventHandler((event) => {
  const siteUrl = (useRuntimeConfig(event).public.siteUrl as string).replace(/\/$/, '');

  // Build date rather than a hand-kept one: it is the last moment the content could have
  // changed, and a lastmod that claims more than that teaches crawlers to ignore it.
  const lastmod = new Date().toISOString().slice(0, 10);

  const urls = PAGES.map(({ path, changefreq, priority }) => `  <url>
    <loc>${siteUrl}${path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join('\n');

  setHeader(event, 'content-type', 'application/xml; charset=utf-8');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
});
