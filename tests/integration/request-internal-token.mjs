import { readFileSync } from 'node:fs';

import { credentials, loadPackageDefinition, Metadata } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';

const accessToken = process.argv[2];
const certificateName = process.argv[3] ?? 'gateway';
const audience = process.argv[4] ?? 'TOKEN_AUDIENCE_ATTENDANCE';
if (!accessToken) throw new Error('Access token is required');

const definition = loadSync(
  '/app/packages/contracts/proto/dexa/identity/v1/identity.proto',
  {
    defaults: true,
    keepCase: false,
    longs: String,
    oneofs: true,
  },
);
const identityPackage = loadPackageDefinition(definition).dexa.identity.v1;
const IdentityService = identityPackage.IdentityService;
const client = new IdentityService(
  'identity:50051',
  credentials.createSsl(
    readFileSync(
      certificateName === 'gateway'
        ? '/app/.local/pki/ca.crt'
        : '/app/.local/pki/server-ca.crt',
    ),
    readFileSync(`/app/.local/pki/${certificateName}.key`),
    readFileSync(`/app/.local/pki/${certificateName}.crt`),
  ),
  {
    'grpc.ssl_target_name_override': 'identity',
    'grpc.default_authority': 'identity',
  },
);
const metadata = new Metadata();
metadata.set('authorization', `Bearer ${accessToken}`);
metadata.set('x-correlation-id', '00000000-0000-4000-8000-000000000099');

const response = await new Promise((resolve, reject) => {
  client.AuthorizeAccess(
    { audiences: audience === 'none' ? [] : [audience] },
    metadata,
    (error, value) => (error ? reject(error) : resolve(value)),
  );
});
client.close();
process.stdout.write(response.tokens[0].token);
