"""Story Engine Service for creative writing assistance"""
from typing import List, Optional, Dict
from sqlalchemy.orm import Session
from models import Story, Chapter, Character, PlotBrainstorm, BeatScene, KeyEvent, WorldBuildingElement
from services.openrouter_service import OpenRouterService
import os


class StoryService:
    def __init__(self, openrouter_api_key: str):
        self.openrouter = OpenRouterService(api_key=openrouter_api_key)
    
    # Story CRUD
    def create_story(self, db: Session, user_id: int, title: str, description: str = None) -> Story:
        story = Story(user_id=user_id, title=title, description=description)
        db.add(story)
        db.commit()
        db.refresh(story)
        
        # Automatically create first chapter
        first_chapter = Chapter(
            story_id=story.id,
            title=f"{title} - Chapter 1",
            text="",
            order=1
        )
        db.add(first_chapter)
        db.commit()
        db.refresh(story)
        
        return story
    
    def get_story(self, db: Session, story_id: int, user_id: int) -> Optional[Story]:
        # Expire all objects to ensure fresh data from database
        db.expire_all()
        return db.query(Story).filter(
            Story.id == story_id,
            Story.user_id == user_id
        ).first()
    
    def get_user_stories(self, db: Session, user_id: int) -> List[Story]:
        return db.query(Story).filter(Story.user_id == user_id).all()
    
    def update_story(self, db: Session, story_id: int, user_id: int, **kwargs) -> Optional[Story]:
        story = self.get_story(db, story_id, user_id)
        if not story:
            return None
        
        for key, value in kwargs.items():
            if hasattr(story, key):
                setattr(story, key, value)
        
        db.commit()
        db.refresh(story)
        return story
    
    def delete_story(self, db: Session, story_id: int, user_id: int) -> bool:
        story = self.get_story(db, story_id, user_id)
        if not story:
            return False
        
        db.delete(story)
        db.commit()
        return True
    
    # Chapter CRUD
    def create_chapter(self, db: Session, story_id: int, title: str = None, text: str = None) -> Chapter:
        chapter = Chapter(story_id=story_id, title=title, text=text)
        db.add(chapter)
        db.commit()
        db.refresh(chapter)
        return chapter
    
    def get_chapter(self, db: Session, chapter_id: int) -> Optional[Chapter]:
        return db.query(Chapter).filter(Chapter.id == chapter_id).first()
    
    def get_story_chapters(self, db: Session, story_id: int) -> List[Chapter]:
        return db.query(Chapter).filter(Chapter.story_id == story_id).order_by(Chapter.order).all()
    
    def update_chapter(self, db: Session, chapter_id: int, **kwargs) -> Optional[Chapter]:
        chapter = self.get_chapter(db, chapter_id)
        if not chapter:
            return None
        
        for key, value in kwargs.items():
            if hasattr(chapter, key):
                setattr(chapter, key, value)
        
        db.commit()
        db.refresh(chapter)
        return chapter
    
    # Character CRUD
    def create_character(self, db: Session, story_id: int, name: str, traits: str = None, backstory: str = None) -> Character:
        character = Character(story_id=story_id, name=name, traits=traits, backstory=backstory)
        db.add(character)
        db.commit()
        db.refresh(character)
        return character
    
    def get_story_characters(self, db: Session, story_id: int) -> List[Character]:
        return db.query(Character).filter(Character.story_id == story_id).all()
    
    # AI-Powered Story Generation
    async def generate_chapter_summary(self, chapter_text: str) -> str:
        """Generate a summary of a chapter using AI"""
        prompt = f"""Summarize the following chapter in 2-3 sentences, capturing the key events and emotional arc:

{chapter_text}

Summary:"""
        
        response = ""
        async for chunk in self.openrouter.chat_stream(
            messages=[{"role": "user", "content": prompt}],
            model="anthropic/claude-3.5-sonnet"
        ):
            if chunk:
                response += chunk
        
        return response.strip()
    
    async def generate_character_development(self, character_name: str, existing_traits: str = None) -> str:
        """Generate character development suggestions"""
        context = f"Character name: {character_name}"
        if existing_traits:
            context += f"\nExisting traits: {existing_traits}"
        
        prompt = f"""{context}

Generate a detailed character profile including:
1. Key personality traits
2. Backstory elements
3. Character arc potential
4. Relationships with other characters
5. Internal conflicts

Character Profile:"""
        
        response = ""
        async for chunk in self.openrouter.chat_stream(
            messages=[{"role": "user", "content": prompt}],
            model="anthropic/claude-3.5-sonnet"
        ):
            if chunk:
                response += chunk
        
        return response.strip()
    
    async def generate_plot_suggestions(self, story_context: str) -> str:
        """Generate plot development suggestions"""
        prompt = f"""Given the following story context:

{story_context}

Suggest 5 potential plot developments, twists, or directions the story could take. Be creative and specific.

Plot Suggestions:"""
        
        response = ""
        async for chunk in self.openrouter.chat_stream(
            messages=[{"role": "user", "content": prompt}],
            model="anthropic/claude-3.5-sonnet"
        ):
            if chunk:
                response += chunk
        
        return response.strip()
    
    async def generate_scene_beats(self, chapter_summary: str) -> List[str]:
        """Generate scene beats for a chapter"""
        prompt = f"""Given this chapter summary:

{chapter_summary}

Break this down into 5-7 specific scene beats that capture the key moments and transitions.

Scene Beats:"""
        
        response = ""
        async for chunk in self.openrouter.chat_stream(
            messages=[{"role": "user", "content": prompt}],
            model="anthropic/claude-3.5-sonnet"
        ):
            if chunk:
                response += chunk
        
        # Parse into list
        beats = [line.strip() for line in response.strip().split('\n') if line.strip() and not line.strip().startswith('Scene Beats:')]
        return beats
    
    async def generate_world_building(self, category: str, story_context: str = None) -> str:
        """Generate world-building elements"""
        prompt = f"""Create detailed world-building content for the category: {category}

"""
        if story_context:
            prompt += f"Story context: {story_context}\n\n"
        
        prompt += f"""Generate rich, specific details for this aspect of the story world.

{category}:"""
        
        response = ""
        async for chunk in self.openrouter.chat_stream(
            messages=[{"role": "user", "content": prompt}],
            model="anthropic/claude-3.5-sonnet"
        ):
            if chunk:
                response += chunk
        
        return response.strip()
