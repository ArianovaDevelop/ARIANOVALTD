import { client } from './client';

/**
 * Singleton Sanity write client.
 * Import this instead of calling client.withConfig({ token }) on every request.
 * The SANITY_WRITE_TOKEN is injected once at module load time.
 */
export const writeClient = client.withConfig({
  token: process.env.SANITY_WRITE_TOKEN,
});
