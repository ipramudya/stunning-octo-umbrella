import { credentials, loadPackageDefinition, Metadata } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { readFileSync } from "node:fs";

const [token, employeeId, password] = process.argv.slice(2);
if (!token || !employeeId || !password)
  throw new Error("token, employee id, and password are required");

const definition = loadSync("/app/packages/contracts/proto/dexa/identity/v1/identity.proto", {
  defaults: true,
  keepCase: false,
  longs: String,
  oneofs: true,
});
const IdentityService = loadPackageDefinition(definition).dexa.identity.v1.IdentityService;
const client = new IdentityService(
  "identity:50051",
  credentials.createSsl(
    readFileSync("/app/.local/pki/ca.crt"),
    readFileSync("/app/.local/pki/gateway.key"),
    readFileSync("/app/.local/pki/gateway.crt"),
  ),
  {
    "grpc.ssl_target_name_override": "identity",
    "grpc.default_authority": "identity",
  },
);
const metadata = new Metadata();
metadata.set("authorization", `Bearer ${token}`);
metadata.set("x-correlation-id", "00000000-0000-4000-8000-000000000098");
await new Promise((resolve, reject) => {
  client.ResetEmployeePassword({ employeeId, password }, metadata, (error, value) =>
    error ? reject(error) : resolve(value),
  );
});
client.close();
