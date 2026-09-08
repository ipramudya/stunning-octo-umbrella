import { describe, expect, it } from 'vitest';

import { environmentSchema } from '../src/config.schema.js';

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
