'use client';

import { mutate } from 'swr';
import { z } from 'zod';

import { evidenceUploadSchema } from './contracts';

const problemSchema = z.object({
  code: z.string().optional(),
  detail: z.string().optional(),
  errors: z
    .array(
      z.object({
        code: z.string(),
        field: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
  status: z.number(),
  traceId: z.string().optional(),
});

export class ApiError extends Error {
  readonly problem: z.infer<typeof problemSchema>;

  constructor(problem: z.infer<typeof problemSchema>) {
    super(problem.detail ?? 'Permintaan tidak dapat diproses.');
    this.name = 'ApiError';
    this.problem = problem;
  }
}

let refreshPromise: Promise<boolean> | undefined;

async function requestRefresh() {
  const response = await fetch('/api/v1/auth/refresh', {
    credentials: 'same-origin',
    method: 'POST',
  });

  return response.ok;
}

async function refreshSession() {
  if ('locks' in navigator) {
    return await navigator.locks.request('dexa-auth-refresh', requestRefresh);
  }

  return await requestRefresh();
}

async function refreshOnce() {
  if (refreshPromise !== undefined) {
    return await refreshPromise;
  }

  refreshPromise = refreshSession();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = undefined;
  }
}

async function parseError(response: Response) {
  try {
    const result = problemSchema.safeParse(await response.json());

    if (result.success) {
      return new ApiError(result.data);
    }
  } catch {
    // Preserve the HTTP status when an intermediary returns a non-JSON body.
  }

  return new ApiError({ status: response.status });
}

export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
  retried = false,
): Promise<T> {
  const headers = new Headers(init?.headers);

  if (init?.body !== undefined && init.body !== null) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'same-origin',
    headers,
  });

  if (response.status === 401 && !retried && path !== '/auth/refresh') {
    const refreshed = await refreshOnce();

    if (refreshed) {
      return await api(path, schema, init, true);
    }
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) {
    return schema.parse(null);
  }

  return schema.parse(await response.json());
}

export async function apiPages<T>(
  path: string,
  schema: z.ZodType<{
    items: T[];
    pageInfo: { hasNextPage: boolean; nextCursor?: string };
  }>,
) {
  const separator = path.includes('?') ? '&' : '?';
  const load = async (cursor?: string): Promise<T[]> => {
    let pagePath = path;
    if (cursor !== undefined) {
      pagePath = `${path}${separator}cursor=${encodeURIComponent(cursor)}`;
    }

    const page = await api(pagePath, schema);
    const { nextCursor } = page.pageInfo;

    if (page.pageInfo.hasNextPage && nextCursor !== undefined) {
      return [...page.items, ...(await load(nextCursor))];
    }

    return page.items;
  };

  return await load();
}

export async function mutateApi<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit,
  invalidatedKeys: string[],
) {
  const result = await api(path, schema, init);

  await mutate(
    (key) =>
      typeof key === 'string' &&
      invalidatedKeys.some((prefix) => key.startsWith(prefix)),
  );

  return result;
}

export async function uploadEvidence(file: File) {
  const authorization = await api(
    '/me/evidence-uploads',
    evidenceUploadSchema,
    {
      body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
      method: 'POST',
    },
  );
  const response = await fetch(authorization.url, {
    body: file,
    headers: authorization.headers,
    method: authorization.method,
  });

  if (!response.ok) {
    throw new Error('Bukti foto gagal diunggah.');
  }

  return authorization.uploadId;
}
