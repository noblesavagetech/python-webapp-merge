#!/usr/bin/env python3
import psycopg2
import os

# Use the DATABASE_URL with public hostname if needed
# For Railway internal: postgresql://postgres:PMkzqhjDuGIIazEtIbziJmNlQJYyKhBi@postgres.railway.internal:5432/railway
# You may need to get the public URL from Railway dashboard

db_url = "postgresql://postgres:PMkzqhjDuGIIazEtIbziJmNlQJYyKhBi@postgres.railway.internal:5432/railway"

try:
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    print("Connected to PostgreSQL!")
    
    # Enable pgvector extension
    cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    conn.commit()
    
    print("✓ pgvector extension enabled successfully!")
    
    # Verify it's installed
    cur.execute("SELECT * FROM pg_extension WHERE extname = 'vector';")
    result = cur.fetchone()
    
    if result:
        print(f"✓ pgvector extension verified: {result}")
    else:
        print("⚠ Extension enabled but not found in pg_extension")
    
    cur.close()
    conn.close()
    
except Exception as e:
    print(f"Error: {e}")
    print("\nIf you see a hostname error, update the script with your Railway public PostgreSQL URL")
    print("Get it from: Railway Dashboard > PostgreSQL > Connect > Public URL")
