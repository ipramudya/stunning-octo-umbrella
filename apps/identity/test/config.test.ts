import { describe, expect, it } from "vitest";
import { environmentSchema } from "../src/config.js";

describe("identity configuration", () => {
  it("requires valid dependency ports", () => {
    expect(environmentSchema.parse({ REDIS_PORT: "6380" }).REDIS_PORT).toBe(6380);
    expect(() => environmentSchema.parse({ ORACLE_PORT: "70000" })).toThrow();
  });
});
