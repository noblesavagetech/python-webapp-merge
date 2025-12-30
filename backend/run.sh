#!/bin/bash
set -e

# Find and add GCC library path
export LD_LIBRARY_PATH=$(find /nix/store -name "libstdc++.so.6" 2>/dev/null | head -n1 | xargs dirname):$LD_LIBRARY_PATH

# Start the application
exec python3.11 -m uvicorn main:app --host 0.0.0.0 --port $PORT
