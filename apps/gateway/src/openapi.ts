import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function configureOpenApi(app: NestFastifyApplication) {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Dexa WFH Attendance API')
      .setDescription(
        'Browser-facing API for authentication, attendance, evidence, and HRD administration.',
      )
      .setVersion('1')
      .addCookieAuth('dexa_access')
      .build(),
  );

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/openapi.json',
  });
}
