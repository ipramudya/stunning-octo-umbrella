import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { environmentSchema } from './config/config-typedef.js';
import { HealthModule } from './health/health.module.js';
import { IdentityModule } from './identity.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      ignoreEnvFile: true,
      isGlobal: true,
      validate: (config) => environmentSchema.parse(config),
    }),
    IdentityModule,
    HealthModule,
  ],
})
export class AppModule {}
