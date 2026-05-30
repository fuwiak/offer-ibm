#!/bin/bash

# Railway injects PORT; entrypoint mirrors it to SERVER_PORT
PORT="${PORT:-${SERVER_PORT:-3000}}"
response=$(curl --write-out '%{http_code}' --silent --output /dev/null "http://127.0.0.1:${PORT}/api/ping")

if [ "$response" -eq 200 ]; then
  echo "Server is up on port ${PORT}"
  exit 0
else
  echo "Server is down (port ${PORT}, http ${response})"
  exit 1
fi
