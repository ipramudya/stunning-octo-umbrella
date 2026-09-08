import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import type { Environment } from "./config.js";
import type { EmployeeRepository } from "./employee.repository.js";
import { IdentityAuthService } from "./identity.service.js";
import type { SessionStore } from "./session.store.js";
import type { TokenService } from "./tokens.js";

describe("IdentityAuthService", () => {
  it("rejects a session after the employee credential version changes", async () => {
    const employees = {
      findById: vi.fn().mockResolvedValue({
        id: "employee",
        employeeNumber: "DEX-001",
        fullName: "Employee",
        phoneNumber: "+6280000000002",
        passwordHash: "unused",
        credentialVersion: 2,
        roles: ["EMPLOYEE"],
      }),
    };
    const sessions = {
      get: vi.fn().mockResolvedValue({
        employeeId: "employee",
        credentialVersion: 1,
      }),
    };
    const tokens = {
      verify: vi.fn().mockResolvedValue({ sub: "employee", sid: "session" }),
    };
    const service = new IdentityAuthService(
      {} as ConfigService<Environment, true>,
      employees as unknown as EmployeeRepository,
      sessions as unknown as SessionStore,
      tokens as unknown as TokenService,
    );

    await expect(service.authorize("token", [])).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
    });
  });

  it("accepts an omitted audience list", async () => {
    const employee = {
      id: "employee",
      employeeNumber: "DEX-001",
      fullName: "Employee",
      phoneNumber: "+6280000000002",
      passwordHash: "unused",
      credentialVersion: 1,
      roles: ["EMPLOYEE"],
    };
    const service = new IdentityAuthService(
      {} as ConfigService<Environment, true>,
      { findById: vi.fn().mockResolvedValue(employee) } as unknown as EmployeeRepository,
      {
        get: vi.fn().mockResolvedValue({ employeeId: employee.id, credentialVersion: 1 }),
      } as unknown as SessionStore,
      {
        verify: vi.fn().mockResolvedValue({ sub: employee.id, sid: "session" }),
      } as unknown as TokenService,
    );

    await expect(service.authorize("token", undefined)).resolves.toMatchObject({
      sessionId: "session",
      tokens: [],
    });
  });
});
