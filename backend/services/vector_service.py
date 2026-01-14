import httpx
from typing import List, Dict, Optional
from sqlalchemy import create_engine, text
import os
import json

class VectorService:
    def __init__(self, database_url: str = None, openrouter_api_key: str = ""):
        """
        Initialize vector service with pgvector (PostgreSQL)
        Falls back gracefully if pgvector is not available
        """
        self.api_key = openrouter_api_key
        self.database_url = database_url or os.getenv("DATABASE_URL", "")
        
        # Fix postgres:// to postgresql://
        if self.database_url.startswith("postgres://"):
            self.database_url = self.database_url.replace("postgres://", "postgresql://", 1)
        
        # Only initialize if we have a PostgreSQL database
        self.enabled = False
        if self.database_url and not self.database_url.startswith("sqlite"):
            try:
                self.engine = create_engine(self.database_url)
                self._ensure_table()
                self.enabled = True
                print("✅ VectorService initialized with pgvector")
            except Exception as e:
                print(f"⚠️  VectorService disabled: {e}")
        else:
            print("⚠️  VectorService disabled: SQLite detected (pgvector requires PostgreSQL)")
    
    def _ensure_table(self):
        """Create vector embeddings table if it doesn't exist"""
        with self.engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS vector_embeddings (
                    id SERIAL PRIMARY KEY,
                    collection_name VARCHAR(255) NOT NULL,
                    content TEXT NOT NULL,
                    embedding vector(1536),
                    metadata JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            
            # Create unique index to prevent duplicates
            conn.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS vector_embeddings_unique_idx 
                ON vector_embeddings (collection_name, MD5(content))
            """))
            
            # Create index for faster similarity search
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS vector_embeddings_embedding_idx 
                ON vector_embeddings 
                USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = 100)
            """))
            conn.commit()
    
    async def _get_embedding(self, text: str) -> List[float]:
        """Get embedding from OpenRouter API"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://membrane.app",
            "X-Title": "The Membrane"
        }
        
        payload = {
            "model": "openai/text-embedding-3-small",
            "input": text
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/embeddings",
                headers=headers,
                json=payload
            )
            response.raise_for_status()
            data = response.json()
            return data["data"][0]["embedding"]
    
    async def add_memory(
        self,
        collection_name: str,
        content: str,
        metadata: Optional[Dict] = None
    ):
        """Add content to vector memory"""
        if not self.enabled:
            print("⚠️  VectorService is disabled")
            return
            
        # Generate embedding via OpenRouter
        embedding = await self._get_embedding(content)
        
        # Convert embedding list to PostgreSQL vector format
        embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"
        
        # Insert into database (will skip if duplicate due to unique index)
        with self.engine.connect() as conn:
            try:
                conn.execute(
                    text("""
                        INSERT INTO vector_embeddings 
                        (collection_name, content, embedding, metadata)
                        VALUES (:collection, :content, :embedding::vector, :metadata::jsonb)
                    """),
                    {
                        "collection": collection_name,
                        "content": content,
                        "embedding": embedding_str,
                        "metadata": json.dumps(metadata or {})
                    }
                )
                conn.commit()
            except Exception as e:
                # Likely a duplicate, ignore
                if "duplicate" in str(e).lower() or "unique" in str(e).lower():
                    pass
                else:
                    raise
    
    async def search(
        self,
        collection_name: str,
        query: str,
        top_k: int = 5
    ) -> List[str]:
        """Search vector memory for relevant content using cosine similarity"""
        if not self.enabled:
            return []
            
        try:
            # Generate query embedding via OpenRouter
            query_embedding = await self._get_embedding(query)
            
            # Convert to PostgreSQL vector format
            embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"
            
            # Search using cosine similarity (<=> operator)
            with self.engine.connect() as conn:
                results = conn.execute(
                    text("""
                        SELECT content
                        FROM vector_embeddings
                        WHERE collection_name = :collection
                        ORDER BY embedding <=> :query_embedding::vector
                        LIMIT :limit
                    """),
                    {
                        "collection": collection_name,
                        "query_embedding": embedding_str,
                        "limit": top_k
                    }
                )
                
                return [row[0] for row in results]
        except Exception as e:
            print(f"Search error: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def delete_project_memories(self, collection_name: str):
        """Delete all memories for a collection"""
        if not self.enabled:
            return
            
        try:
            with self.engine.connect() as conn:
                conn.execute(
                    text("DELETE FROM vector_embeddings WHERE collection_name = :collection"),
                    {"collection": collection_name}
                )
                conn.commit()
        except Exception as e:
            print(f"Delete error: {e}")
