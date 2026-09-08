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
