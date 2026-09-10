import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { apiPages } from './api';

const pageSchema = z.object({
  items: z.array(z.number()),
  pageInfo: z.object({
    hasNextPage: z.boolean(),
    nextCursor: z.string().optional(),
  }),
});

describe('apiPages', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads every cursor in order', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json({
          items: [1],
          pageInfo: { hasNextPage: true, nextCursor: 'next page' },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ items: [2], pageInfo: { hasNextPage: false } }),
      );
    vi.stubGlobal('fetch', fetch);

    await expect(apiPages('/items?limit=1', pageSchema)).resolves.toEqual([
      1, 2,
    ]);
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/v1/items?limit=1&cursor=next%20page',
      expect.any(Object),
    );
  });
});
