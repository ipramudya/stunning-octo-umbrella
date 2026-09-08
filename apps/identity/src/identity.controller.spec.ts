import { describe, expect, it, vi } from "vitest";
import { IdentityController } from "./identity.controller.js";
import type { IdentityAuthService } from "./identity.service.js";

describe("IdentityController", () => {
  it("delegates login credentials to the auth service", async () => {
    const credentials = {
      profile: undefined,
      accessToken: "access",
      refreshToken: "refresh",
    };
    const auth = { login: vi.fn().mockResolvedValue(credentials) };
    const controller = new IdentityController(auth as unknown as IdentityAuthService);

    await expect(
      controller.login({ phoneNumber: "+6280000000002", password: "valid-password" }),
    ).resolves.toBe(credentials);
  });
});
