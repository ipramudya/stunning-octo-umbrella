import { type HealthCheckResponse, HealthCheckResponse_ServingStatus } from "@project/contracts";
import { Controller } from "@nestjs/common";
import { GrpcMethod } from "@nestjs/microservices";
import { ReadinessService } from "./readiness.js";

@Controller()
export class GrpcHealthController {
  constructor(private readonly readiness: ReadinessService) {}

  @GrpcMethod("Health", "Check")
  async check(): Promise<HealthCheckResponse> {
    return {
      status: (await this.readiness.isReady())
        ? HealthCheckResponse_ServingStatus.SERVING
        : HealthCheckResponse_ServingStatus.NOT_SERVING,
    };
  }
}
