import httpx
import json
from typing import AsyncGenerator, Optional

class OpenRouterService:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://openrouter.ai/api/v1"
        
    async def stream_chat(
        self,
        message: str,
        context: str,
        model: str,
        partner: str = "balanced"
    ) -> AsyncGenerator[str, None]:
        """Stream chat completions from OpenRouter"""
        
        # Detect if this is a quick action command (text improvement)
        is_quick_action = message.lower().strip() in ['/improve', '/expand', '/simplify', '/challenge']
        
        if is_quick_action:
            # Strict text-only transformation prompt
            action_prompts = {
                '/improve': 'Improve the following text by making it more clear, impactful, and well-written. Return ONLY the improved version of the text with no explanations, preambles, or commentary.',
                '/expand': 'Expand the following text with more detail, depth, and elaboration. Return ONLY the expanded version of the text with no explanations, preambles, or commentary.',
                '/simplify': 'Simplify the following text to make it clearer and more concise. Return ONLY the simplified version of the text with no explanations, preambles, or commentary.',
                '/challenge': 'Challenge the assumptions and arguments in the following text. Return ONLY a revised version that addresses these challenges with no explanations, preambles, or commentary.'
            }
            
            system_prompt = action_prompts.get(message.lower().strip(), action_prompts['/improve'])
            user_message = f"Text to transform:\n\n{context}\n\nIMPORTANT: Output ONLY the transformed text. No preamble, no explanation, no 'Here is...', no analysis. Just the pure transformed text."
        else:
            # Standard conversational mode
            partner_prompts = {
                "critical": "You are a critical thinking partner. Challenge assumptions, identify flaws, and ask probing questions. Be rigorous and analytical.",
                "balanced": "You are a balanced thinking partner. Weigh options thoughtfully, provide multiple perspectives, and help refine ideas with constructive feedback.",
                "expansive": "You are an expansive thinking partner. Explore possibilities freely, make creative connections, and encourage bold ideas without immediate criticism."
            }
            
            system_prompt = partner_prompts.get(partner, partner_prompts["balanced"])
            user_message = f"{context}\n\nUser message: {message}"
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://membrane.app",
            "X-Title": "The Membrane"
        }
        
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            "stream": True,
            "temperature": 0.7 if not is_quick_action else 0.3,  # Lower temperature for text transformations
            "max_tokens": 2000
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                            if "choices" in chunk and len(chunk["choices"]) > 0:
                                delta = chunk["choices"][0].get("delta", {})
                                if "content" in delta:
                                    yield delta["content"]
                        except json.JSONDecodeError:
                            continue
    
    async def get_ghost_suggestion(
        self,
        text: str,
        cursor_position: int,
        purpose: str,
        model: str
    ) -> str:
        """Get a ghost-writing suggestion"""
        
        # Get context before cursor (last 500 chars for efficiency)
        context = text[:cursor_position]
        relevant_context = context[-500:] if len(context) > 500 else context
        
        # Don't suggest if context is too short
        if len(relevant_context.strip()) < 10:
            return ""
        
        purpose_prompts = {
            "writing": "creative and analytical writing",
            "accounting": "financial and accounting documentation",
            "research": "academic and research writing",
            "general": "general writing"
        }
        
        purpose_desc = purpose_prompts.get(purpose, purpose_prompts["general"])
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://membrane.app",
            "X-Title": "The Membrane"
        }
        
        payload = {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": f"You are an autocomplete assistant for {purpose_desc}. Complete the text. Output ONLY the continuation, no explanations."
                },
                {
                    "role": "user",
                    "content": relevant_context
                }
            ],
            "stream": False,
            "temperature": 0.7,
            "max_tokens": 50
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload
            )
            response.raise_for_status()
            data = response.json()
            
            if "choices" in data and len(data["choices"]) > 0:
                suggestion = data["choices"][0]["message"]["content"].strip()
                # Remove any quotes or meta-text
                suggestion = suggestion.strip('"\'')
                # If it starts with apologizing or explaining, reject it
                if any(suggestion.lower().startswith(x) for x in ['i cannot', 'i apologize', 'without', 'i need', 'please provide']):
                    return ""
                return " " + suggestion  # Add leading space
            return ""
    
    async def summarize_text(
        self,
        text: str,
        prompt: str,
        model: str = "google/gemini-2.5-flash"
    ) -> str:
        """Summarize text using specified model and prompt"""
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://membrane.app",
            "X-Title": "The Membrane"
        }
        
        payload = {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": prompt
                },
                {
                    "role": "user",
                    "content": text
                }
            ],
            "stream": False,
            "temperature": 0.3,
            "max_tokens": 1000
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload
            )
            response.raise_for_status()
            data = response.json()
            
            if "choices" in data and len(data["choices"]) > 0:
                return data["choices"][0]["message"]["content"].strip()
            return ""
