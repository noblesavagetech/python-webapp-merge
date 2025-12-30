# Multi-stage build for Python + Node.js app
FROM node:20-slim AS frontend-builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source and build frontend
COPY . .
RUN npm run build

# Python runtime stage
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for chromadb/onnxruntime
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install Python deps
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy built frontend from builder stage
COPY --from=frontend-builder /app/dist ./dist

# Expose port
EXPOSE 8000

# Start command - use Railway's PORT env variable
CMD python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --app-dir backend
