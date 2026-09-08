import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import type { Employee } from "./auth.js";
import type { Environment } from "./config.schema.js";
import { EmployeeAdminService } from "./employee-admin.service.js";
import type { EmployeeRepository } from "./employee.repository.js";
import type { SessionStore } from "./session.store.js";
import type { TokenService } from "./tokens.js";

const employee = (employeeNumber: string, id: string): Employee => ({
  id,
  employeeNumber,
  fullName: `Employee ${employeeNumber}`,
  phoneNumber: `+628${employeeNumber.slice(-3)}`,
  passwordHash: "hidden",
  credentialVersion: 1,
  roles: ["EMPLOYEE"],
});

function service(overrides: Partial<EmployeeRepository> = {}, roles = ["HRD"]) {
  const employees = {
    list: vi.fn(),
    findById: vi.fn(),
    conflict: vi.fn().mockResolvedValue(undefined),
    updatePhone: vi.fn(),
    ...overrides,
  };
  const sessions = { revokeEmployee: vi.fn() };
  const tokens = { verify: vi.fn().mockResolvedValue({ sub: "hrd", roles }) };
  return {
    value: new EmployeeAdminService(
      { get: vi.fn().mockReturnValue(1) } as unknown as ConfigService<Environment, true>,
      employees as unknown as EmployeeRepository,
      sessions as unknown as SessionStore,
      tokens as unknown as TokenService,
    ),
    employees,
    sessions,
    tokens,
  };
}

describe("EmployeeAdminService", () => {
  it("uses a stable endpoint-bound cursor and limit plus one", async () => {
    const first = employee("DEX-001", "00000000-0000-4000-8000-000000000001");
    const second = employee("DEX-002", "00000000-0000-4000-8000-000000000002");
    const { value, employees } = service({ list: vi.fn().mockResolvedValue([first, second]) });

    const page = await value.list({
      token: "token",
      query: undefined,
      cursor: undefined,
      requestedLimit: 1,
    });

    expect(page.items).toHaveLength(1);
    expect(page.hasNextPage).toBe(true);
    expect(employees.list).toHaveBeenCalledWith(undefined, undefined, 1);
    await value.list({
      token: "token",
      query: undefined,
      cursor: page.nextCursor,
      requestedLimit: 1,
    });
    expect(employees.list).toHaveBeenLastCalledWith(
      undefined,
      { employeeNumber: first.employeeNumber, id: first.id },
      1,
    );
    await expect(
      value.list({
        token: "token",
        query: undefined,
        cursor: Buffer.from("{}").toString("base64url"),
        requestedLimit: 1,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CURSOR",
    });
  });

  it("denies a delegated token without HRD", async () => {
    const { value } = service({}, ["EMPLOYEE"]);
    await expect(value.get("token", "employee")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps a committed phone correction valid when Redis cleanup fails", async () => {
    const changed = employee("DEX-001", "employee");
    changed.phoneNumber = "+628999";
    const { value, sessions, employees } = service({
      updatePhone: vi.fn().mockResolvedValue(true),
      findById: vi.fn().mockResolvedValue(changed),
    });
    sessions.revokeEmployee.mockRejectedValue(new Error("redis unavailable"));

    await expect(value.updatePhone("token", "employee", "+628999")).resolves.toMatchObject({
      phoneNumber: "+628999",
    });
    expect(employees.updatePhone).toHaveBeenCalledOnce();
    expect(sessions.revokeEmployee).toHaveBeenCalledWith("employee");
  });
});
