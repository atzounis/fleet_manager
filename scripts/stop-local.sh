#!/usr/bin/env sh
# Stop local dev servers (Django runserver, Vite) that conflict with Docker ports.
set -e

for port in 52841 8000 61294 5173; do
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "Killing process(es) on port $port: $pids"
    kill $pids 2>/dev/null || kill -9 $pids 2>/dev/null || true
  fi
done

pkill -f "manage.py runserver" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

echo "Local dev processes stopped."
