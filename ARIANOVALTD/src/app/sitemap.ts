import { MetadataRoute } from 'next';
import { sanityFetch } from '@/sanity/lib/fetch';
import { ALL_WINE_SLUGS_QUERY } from '@/sanity/lib/queries';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.arianova.co.nz';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fetch all wine slugs
  const wineSlugs = await sanityFetch<string[]>({
    query: ALL_WINE_SLUGS_QUERY,
  });

  // Base routes
  const routes = [
    '',
    '/wines',
    '/cellar',
    '/vineyard',
    '/events',
    '/story',
    '/studio',
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date().toISOString(),
    changeFrequency: 'weekly' as const,
    priority: route === '' ? 1 : 0.8,
  }));

  // Dynamic wine routes
  const wineRoutes = (wineSlugs || []).map((slug) => ({
    url: `${baseUrl}/wines/${slug}`,
    lastModified: new Date().toISOString(),
    changeFrequency: 'daily' as const,
    priority: 0.9,
  }));

  return [...routes, ...wineRoutes];
}
