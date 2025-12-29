#!/bin/bash
set -e

# Database migration (if needed)
# python -m alembic upgrade head

# Start the application
exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
