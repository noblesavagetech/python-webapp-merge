import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import './StoryDashboard.css';

interface Story {
  id: number;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export function StoryDashboard() {
  const { user, logout } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStoryTitle, setNewStoryTitle] = useState('');
  const [newStoryDescription, setNewStoryDescription] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStories();
  }, []);

  const loadStories = async () => {
    try {
      setLoading(true);
      const response = await api.getStories();
      setStories(response.stories);
    } catch (error) {
      console.error('Failed to load stories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStory = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await api.createStory({ title: newStoryTitle, description: newStoryDescription });
      setNewStoryTitle('');
      setNewStoryDescription('');
      setShowCreateModal(false);
      await loadStories();
    } catch (error) {
      console.error('Failed to create story:', error);
    }
  };

  const handleDeleteStory = async (storyId: number) => {
    if (!confirm('Are you sure you want to delete this story?')) return;
    
    try {
      await api.deleteStory(storyId);
      await loadStories();
    } catch (error) {
      console.error('Failed to delete story:', error);
    }
  };

  if (loading) {
    return <div className="loading-screen">Loading stories...</div>;
  }

  return (
    <div className="story-dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <span className="header-logo">◈</span>
          <h1>Your Membrane</h1>
          <nav className="dashboard-nav">
            <Link to="/dashboard" className="nav-link">Projects</Link>
            <Link to="/stories" className="nav-link active">Stories</Link>
          </nav>
        </div>
        <div className="header-right">
          <span className="user-name">{user?.name || user?.email}</span>
          <button className="logout-btn" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <section className="dashboard-projects">
          <div className="projects-header">
            <h2>Story Engine</h2>
            <button className="new-project-btn" onClick={() => setShowCreateModal(true)}>
              + New Story
            </button>
          </div>

          <div className="projects-grid">
            {stories.map(story => (
              <div key={story.id} className="project-card">
                <Link to={`/story/${story.id}`} className="project-link">
                  <div className="project-icon">📖</div>
                  <div className="project-info">
                    <h3>{story.title}</h3>
                    <p>{story.description || new Date(story.updated_at).toLocaleDateString()}</p>
                  </div>
                </Link>
                <button 
                  className="project-delete"
                  onClick={(e) => {
                    e.preventDefault();
                    handleDeleteStory(story.id);
                  }}
                  title="Delete story"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {stories.length === 0 && (
            <div className="projects-empty">
              <div className="empty-icon">📖</div>
              <h3>Start Your First Story</h3>
              <p>Create a new story and let the AI help you craft amazing narratives.</p>
              <button 
                className="empty-cta"
                onClick={() => setShowCreateModal(true)}
              >
                Create First Story
              </button>
            </div>
          )}
        </section>
      </main>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="new-project-form modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create New Story</h2>
            <form onSubmit={handleCreateStory}>
              <input
                type="text"
                placeholder="Story title..."
                value={newStoryTitle}
                onChange={(e) => setNewStoryTitle(e.target.value)}
                required
                autoFocus
              />
              <input
                type="text"
                placeholder="Description (optional)..."
                value={newStoryDescription}
                onChange={(e) => setNewStoryDescription(e.target.value)}
              />
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="create-btn">
                  Create Story
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
