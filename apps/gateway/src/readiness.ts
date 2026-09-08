import {
  type HealthCheckRequest,
  type HealthCheckResponse,
  HealthCheckResponse_ServingStatus,
} from "@project/contracts";
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { ClientGrpc } from "@nestjs/microservices";
import { catchError, firstValueFrom, map, type Observable, of, timeout } from "rxjs";
import { ATTENDANCE_HEALTH_CLIENT, IDENTITY_HEALTH_CLIENT } from "./grpc-health.client.js";

interface HealthGrpcService {
  check(request: HealthCheckRequest): Observable<HealthCheckResponse>;
}

@Injectable()
export class ReadinessService implements OnModuleInit {
  private attendance!: HealthGrpcService;
  private identity!: HealthGrpcService;

  constructor(
    @Inject(ATTENDANCE_HEALTH_CLIENT) private readonly attendanceClient: ClientGrpc,
    @Inject(IDENTITY_HEALTH_CLIENT) private readonly identityClient: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.attendance = this.attendanceClient.getService<HealthGrpcService>("Health");
    this.identity = this.identityClient.getService<HealthGrpcService>("Health");
  }

  async isReady(): Promise<boolean> {
    const checks = await Promise.all([this.check(this.identity), this.check(this.attendance)]);
    return checks.every(Boolean);
  }

  private check(service: HealthGrpcService): Promise<boolean> {
    return firstValueFrom(
      service.check({ service: "" }).pipe(
        timeout(1_000),
        map((response) => response.status === HealthCheckResponse_ServingStatus.SERVING),
        catchError(() => of(false)),
      ),
    );
  }
}
