import { describe, expect, it } from 'vitest';

import { environmentSchema } from './config-typedef.js';

describe('attendance configuration', () => {
  it('requires an HTTP MinIO endpoint', () => {
    expect(
      environmentSchema.parse({ MINIO_ENDPOINT: 'http://localhost:9000' })
        .MINIO_ENDPOINT,
    ).toBe('http://localhost:9000');
    expect(() =>
      environmentSchema.parse({ MINIO_ENDPOINT: 'minio:9000' }),
    ).toThrow();
  });
});
