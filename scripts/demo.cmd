@echo off
setlocal
cd /d "%~dp0.."

if not defined COMPOSE_ENV_FILE set "COMPOSE_ENV_FILE=.env.demo"
set "ACTION=%~1"
if "%ACTION%"=="" set "ACTION=up"

if /i "%ACTION%"=="up" (
  docker compose --env-file "%COMPOSE_ENV_FILE%" up --build --wait
  if errorlevel 1 exit /b %errorlevel%
  docker image prune --force --filter label=com.docker.compose.project=dexa
  exit /b %errorlevel%
)

if /i "%ACTION%"=="down" (
  docker compose --env-file "%COMPOSE_ENV_FILE%" down --volumes --remove-orphans
  exit /b %errorlevel%
)

echo Penggunaan: %~nx0 [up^|down] 1>&2
exit /b 2
