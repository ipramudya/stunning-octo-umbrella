# Dexa

Backend walking skeleton for the Dexa work-from-home attendance technical test.

## Run

Docker Compose builds the applications and starts Oracle Free, Redis, MinIO, Identity, Attendance, and Gateway. No `.env` file is required.

```bash
docker compose up --build --wait
```

Gateway endpoints:

- Liveness: http://localhost:3000/health/live
- Readiness: http://localhost:3000/health/ready

## Stop

```bash
docker compose down --volumes
```

Optional local overrides are documented in `.env.example`.

## Review and operate

`docker compose up --build --wait` is the release review path. It needs only Docker: Compose generates the local PKI, initializes both Oracle schemas, applies migrations and seeds, and configures the private, versioned MinIO bucket and staging lifecycle. Published ports are limited to Gateway and the direct evidence upload endpoint.

- `/health/live` checks only that the process event loop can answer.
- `/health/ready` checks required databases, Redis, MinIO, schema capabilities, downstream mTLS, and Attendance evidence recovery.
- Every API response carries a generated `X-Correlation-ID`; use it to correlate Gateway and gRPC failures without logging credentials, bodies, signed URLs, or evidence keys.
- Unsafe API requests must carry the exact `Origin` configured by `APP_ORIGIN`. Business request bodies are JSON-only and limited to 64 KiB.
- Stop with `docker compose down`; use `--volumes` only when resetting all local data and generated keys.

Run `npm run check` for formatting, linting, typechecking, unit tests, and contract drift. Run `npm run test:integration` for the serial real-dependency backend journeys.
