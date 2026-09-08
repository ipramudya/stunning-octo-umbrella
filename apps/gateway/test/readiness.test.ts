import { HealthCheckResponse_ServingStatus } from "@dexa/contracts";
import type { ClientGrpc } from "@nestjs/microservices";
import { describe, expect, it } from "vitest";
import { of } from "rxjs";
import { ReadinessService } from "../src/readiness.js";

function client(status: HealthCheckResponse_ServingStatus): ClientGrpc {
  return {
    getService: () => ({ check: () => of({ status }) }),
  } as unknown as ClientGrpc;
}

describe("gateway readiness", () => {
  it("requires both downstream services to be serving", async () => {
    const ready = new ReadinessService(
      client(HealthCheckResponse_ServingStatus.SERVING),
      client(HealthCheckResponse_ServingStatus.SERVING),
    );
    ready.onModuleInit();
    await expect(ready.isReady()).resolves.toBe(true);

    const unavailable = new ReadinessService(
      client(HealthCheckResponse_ServingStatus.NOT_SERVING),
      client(HealthCheckResponse_ServingStatus.SERVING),
    );
    unavailable.onModuleInit();
    await expect(unavailable.isReady()).resolves.toBe(false);
  });
});
