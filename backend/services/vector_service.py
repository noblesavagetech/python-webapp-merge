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
        self.use_pgvector = False
        if self.database_url and not self.database_url.startswith("sqlite"):
            try:
                self.engine = create_engine(self.database_url)
                self._ensure_table()
                self.enabled = True
                print(f"✅ VectorService initialized (pgvector: {self.use_pgvector})")
            except Exception as e:
                print(f"❌ VectorService initialization failed: {e}")
                import traceback
                traceback.print_exc()
        else:
            print("⚠️  VectorService disabled: SQLite detected (pgvector requires PostgreSQL)")
    
    def _ensure_table(self):
        """Create vector embeddings table - uses JSONB if pgvector not available"""
        # Try to enable pgvector extension in a separate transaction
        self.use_pgvector = False
        try:
            with self.engine.connect() as conn:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                conn.commit()
                self.use_pgvector = True
                print("✅ pgvector extension enabled")
        except Exception as e:
            # pgvector not available, use JSONB instead
            print(f"ℹ️  pgvector not available, using JSONB fallback")
        
        # Now create/update table in a fresh transaction
        with self.engine.connect() as conn:
            # Check if table exists
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'vector_embeddings'
                )
            """))
            table_exists = result.scalar()
            
            # If table exists, drop it to ensure clean schema
            if table_exists:
                print("🔄 Dropping existing vector_embeddings table for schema update")
                conn.execute(text("DROP TABLE IF EXISTS vector_embeddings CASCADE"))
                conn.commit()
            
            if self.use_pgvector:
                # Use native vector type
                conn.execute(text("""
                    CREATE TABLE vector_embeddings (
                        id SERIAL PRIMARY KEY,
                        collection_name VARCHAR(255) NOT NULL,
                        content TEXT NOT NULL,
                        embedding vector(1536),
                        metadata JSONB,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                
                # Create index for faster similarity search
                try:
                    conn.execute(text("""
                        CREATE INDEX vector_embeddings_embedding_idx 
                        ON vector_embeddings 
                        USING ivfflat (embedding vector_cosine_ops)
                        WITH (lists = 100)
                    """))
                except Exception as idx_error:
                    print(f"ℹ️  Could not create ivfflat index: {idx_error}")
            else:
                # Fallback: use JSONB for embeddings
                conn.execute(text("""
                    CREATE TABLE vector_embeddings (
                        id SERIAL PRIMARY KEY,
                        collection_name VARCHAR(255) NOT NULL,
                        content TEXT NOT NULL,
                        embedding JSONB,
                        metadata JSONB,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
            
            # Create unique index to prevent duplicates
            conn.execute(text("""
                CREATE UNIQUE INDEX vector_embeddings_unique_idx 
                ON vector_embeddings (collection_name, MD5(content))
            """))
            
            conn.commit()
            print(f"✅ Vector table created (using {'pgvector' if self.use_pgvector else 'JSONB fallback'})")
    
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
        
        # Insert into database
        with self.engine.connect() as conn:
            try:
                if self.use_pgvector:
                    # Use native vector type
                    embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"
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
                else:
                    # Use JSONB - pass the JSON string directly without ::jsonb cast
                    conn.execute(
                        text("""
                            INSERT INTO vector_embeddings 
                            (collection_name, content, embedding, metadata)
                            VALUES (:collection, :content, :embedding, :metadata)
                        """),
                        {
                            "collection": collection_name,
                            "content": content,
                            "embedding": json.dumps(embedding),
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
            
            with self.engine.connect() as conn:
                if self.use_pgvector:
                    # Use native pgvector similarity search
                    embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"
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
                else:
                    # Fallback: compute cosine similarity in Python
                    results = conn.execute(
                        text("""
                            SELECT content, embedding
                            FROM vector_embeddings
                            WHERE collection_name = :collection
                        """),
                        {"collection": collection_name}
                    )
                    
                    # Compute similarities and sort
                    docs_with_scores = []
                    for row in results:
                        content = row[0]
                        embedding = json.loads(row[1])
                        similarity = self._cosine_similarity(query_embedding, embedding)
                        docs_with_scores.append((content, similarity))
                    
                    # Sort by similarity and take top_k
                    docs_with_scores.sort(key=lambda x: x[1], reverse=True)
                    return [doc for doc, _ in docs_with_scores[:top_k]]
                
                return [row[0] for row in results]
        except Exception as e:
            print(f"Search error: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def _cosine_similarity(self, a: List[float], b: List[float]) -> float:
        """Compute cosine similarity between two vectors"""
        import math
        dot_product = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(y * y for y in b))
        return dot_product / (norm_a * norm_b) if norm_a and norm_b else 0.0
    
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
