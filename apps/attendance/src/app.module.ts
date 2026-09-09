import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AttendanceModule } from './attendance.module.js';
import { environmentSchema } from './config/config-typedef.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      ignoreEnvFile: true,
      isGlobal: true,
      validate: (config) => environmentSchema.parse(config),
    }),
    AttendanceModule,
    HealthModule,
  ],
})
export class AppModule {}
