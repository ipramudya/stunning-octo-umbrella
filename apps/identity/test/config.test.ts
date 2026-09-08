import { describe, expect, it } from "vitest";
import { environmentSchema } from "../src/config.js";

describe("identity configuration", () => {
  it("requires valid dependency configuration", () => {
    expect(environmentSchema.parse({ REDIS_URL: "redis://localhost:6380" }).REDIS_URL).toBe(
      "redis://localhost:6380",
    );
    expect(() => environmentSchema.parse({ ORACLE_POOL_MAX: "0" })).toThrow();
  });
});
