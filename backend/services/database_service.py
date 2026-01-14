from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator
import os
from pathlib import Path
import logging

from models import Base

logger = logging.getLogger(__name__)

# Database configuration with Railway fallback (per SOP)
def get_database_url():
    """
    Get database URL with fallback logic per SOP requirements:
    1. Use DATABASE_URL if present (Railway/production)
    2. Fix postgres:// to postgresql:// for SQLAlchemy compatibility
    3. Fall back to local SQLite if DATABASE_URL is missing (development)
    """
    database_url = os.getenv("DATABASE_URL")
    
    if database_url:
        # Fix Railway's postgres:// URL to postgresql:// for SQLAlchemy
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
            logger.info("✅ Using PostgreSQL database (production)")
        return database_url
    else:
        # Fallback to SQLite for local development
        DATABASE_DIR = Path(__file__).parent.parent / "data"
        DATABASE_DIR.mkdir(exist_ok=True)
        sqlite_url = f"sqlite:///{DATABASE_DIR}/membrane.db"
        logger.info("✅ Using SQLite database (development fallback)")
        return sqlite_url

DATABASE_URL = get_database_url()

# Create engine with appropriate configuration
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}  # Needed for SQLite
    )
else:
    # PostgreSQL configuration
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,  # Verify connections before using
        pool_size=5,
        max_overflow=10
    )

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    """
    Initialize the database with try-create logic per SOP:
    - Creates all tables if they don't exist
    - Handles cold-start scenarios gracefully
    - Enables pgvector extension for PostgreSQL
    """
    try:
        logger.info("🔧 Initializing database schema...")
        
        # Enable pgvector extension for PostgreSQL
        if not DATABASE_URL.startswith("sqlite"):
            try:
                with engine.connect() as conn:
                    conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                    conn.commit()
                logger.info("✅ pgvector extension enabled")
            except Exception as e:
                logger.warning(f"⚠️  Could not enable pgvector extension: {e}")
        
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Database schema initialized successfully")
    except Exception as e:
        logger.error(f"❌ Failed to initialize database: {e}")
        raise

def get_db() -> Generator[Session, None, None]:
    """Dependency to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
