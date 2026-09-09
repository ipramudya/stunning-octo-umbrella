import { readFileSync } from 'node:fs';

import { credentials, loadPackageDefinition, Metadata } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';

const accessToken = process.argv[2];
const certificateName = process.argv[3] ?? 'gateway';
const audience = process.argv[4] ?? 'TOKEN_AUDIENCE_ATTENDANCE';

if (!accessToken) {
  throw new Error('Access token is required');
}

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
let certificateAuthority = '/app/.local/pki/server-ca.crt';
if (certificateName === 'gateway') {
  certificateAuthority = '/app/.local/pki/ca.crt';
}

const client = new IdentityService(
  'identity:50051',
  credentials.createSsl(
    readFileSync(certificateAuthority),
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

const audiences = [];

if (audience !== 'none') {
  audiences.push(audience);
}

const response = await new Promise((resolve, reject) => {
  client.AuthorizeAccess({ audiences }, metadata, (error, value) => {
    if (error) {
      reject(error);

      return;
    }

    resolve(value);
  });
});

client.close();
process.stdout.write(response.tokens[0].token);
