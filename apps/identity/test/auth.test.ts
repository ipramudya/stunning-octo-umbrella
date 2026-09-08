import { describe, expect, it } from "vitest";
import { validateLogin } from "../src/auth.js";

describe("login validation", () => {
  it("trims only the phone number and counts password Unicode code points", () => {
    expect(validateLogin("  +6280000000001  ", "password1234😀")).toEqual({
      phoneNumber: "+6280000000001",
      password: "password1234😀",
    });
    expect(() => validateLogin("+1", "password1234")).toThrow("VALIDATION_ERROR");
    expect(() => validateLogin("+6280000000001", "short")).toThrow("VALIDATION_ERROR");
  });
});
