import { describe, expect, it } from 'vitest';

import { environmentSchema } from '../src/config.schema.js';

describe('gateway configuration', () => {
  it('parses ports and rejects malformed endpoints', () => {
    expect(environmentSchema.parse({ HTTP_PORT: '8080' }).HTTP_PORT).toBe(8080);
    expect(() =>
      environmentSchema.parse({ IDENTITY_GRPC_URL: 'not-an-endpoint' }),
    ).toThrow();
  });
});
