import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api, API_BASE_URL } from "../../services/api";
import "./StoryEditor.css";

interface Story {
  id: number;
  title: string;
  description: string;
  content?: string;
  chapters?: Chapter[];
}

interface Chapter {
  id: number;
  title: string;
  text?: string;
  summary?: string;
  order: number;
}

interface Character {
  id: number;
  name: string;
  traits?: string;
  backstory?: string;
}

interface Beat {
  id: number;
  description: string;
  order: number;
}

interface WorldElement {
  id: number;
  category: string;
  description: string;
}

interface KeyEvent {
  id: number;
  description: string;
  order: number;
}

export function StoryEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [story, setStory] = useState<Story | null>(null);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);

  // Characters
  const [characters, setCharacters] = useState<Character[]>([]);
  const [newCharName, setNewCharName] = useState("");
  const [newCharTraits, setNewCharTraits] = useState("");
  const [newCharBackstory, setNewCharBackstory] = useState("");
  const [editingCharId, setEditingCharId] = useState<number | null>(null);

  // Beats/Scenes
  const [beats, setBeats] = useState<Beat[]>([]);
  const [newBeatDesc, setNewBeatDesc] = useState("");
  const [newBeatOrder, setNewBeatOrder] = useState(1);
  const [editingBeatId, setEditingBeatId] = useState<number | null>(null);

  // World Building
  const [worldElements, setWorldElements] = useState<WorldElement[]>([]);
  const [newWorldCategory, setNewWorldCategory] = useState("Settings");
  const [newWorldDesc, setNewWorldDesc] = useState("");
  const [editingWorldId, setEditingWorldId] = useState<number | null>(null);

  // Key Events
  const [keyEvents, setKeyEvents] = useState<KeyEvent[]>([]);
  const [newEventDesc, setNewEventDesc] = useState("");
  const [newEventOrder, setNewEventOrder] = useState(1);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);

  // AI Generation
  const defaultProsePrompt =
    "You are a narrative designer. Your task is to expand the provided series of beats into a complete, action-oriented scene.\n\nInstructions\nScene Generation: Write the entire scene in the third person. Expand each provided beat into a specific action, an unfolding event, or a piece of purposeful dialogue. The final output must be a unified, cohesive scene, not a simple list of expanded points.\n\nDialogue Rules: Dialogue must be direct and consistent with established character traits. It will be concise, moving the plot forward without unnecessary exposition or filler. Use of purple prose and flowery language is strictly forbidden.\n\nAction Rules: Prioritize physical actions and tangible events. Describe characters' movements and reactions to show their state of mind and propel the narrative.\n\nNarrative Flow: Ensure smooth, logical transitions between beats. The scene must unfold in a continuous and believable sequence.";

  const defaultBeatPrompt =
    "Your role: You are a narrative designer.\n\nYour task: Take the single beat provided and expand it into a detailed, action-oriented sequence of events. Do not simply describe the beat; show the steps, decisions, and consequences that unfold within that moment.\n\nInstructions:\n\nIdentify the core action: First, pinpoint the central action or decision within the given beat. What is the one key thing that happens?\n\nBreak it down: Unpack that single action into a series of smaller, sequential beats. Think about the 'before,' 'during,' and 'after' of the moment.\n\nSetup/Inciting Event: What leads directly to this beat? What decision or discovery is made?\n\nThe Action: What are the specific, physical or verbal actions that unfold? Who does what to whom?\n\nImmediate Consequence: What is the direct result of this action? How does the situation change for the character(s)?";

  const [prosePrompt, setProsePrompt] = useState(defaultProsePrompt);
  const [sceneInput, setSceneInput] = useState("");
  const [selectedCharsProse, setSelectedCharsProse] = useState<string[]>([]);
  const [aiProseResult, setAiProseResult] = useState("");
  const [generatingProse, setGeneratingProse] = useState(false);

  const [beatPrompt, setBeatPrompt] = useState(defaultBeatPrompt);
  const [beatInput, setBeatInput] = useState("");
  const [selectedCharsBeat, setSelectedCharsBeat] = useState<string[]>([]);
  const [aiBeatResult, setAiBeatResult] = useState("");
  const [generatingBeat, setGeneratingBeat] = useState(false);

  // AI Model Selection
  const [proseModel, setProseModel] = useState("anthropic/claude-3.5-sonnet");
  const [beatModel, setBeatModel] = useState("anthropic/claude-3.5-sonnet");

  // Chapter Summarization
  const [summarizing, setSummarizing] = useState(false);

  const storyIdNum = id ? parseInt(id, 10) : null;

  useEffect(() => {
    loadStory();
  }, [id]);

  const loadStory = async () => {
    if (!user || !storyIdNum) {
      navigate("/stories");
      return;
    }

    try {
      setLoading(true);
      const response = await api.getStory(storyIdNum);
      const storyData = response.story;
      setStory(storyData);

      // Load first chapter if available
      if (storyData.chapters && storyData.chapters.length > 0) {
        const firstChapter = storyData.chapters[0];
        setCurrentChapter(firstChapter);
        setTitle(firstChapter.title || "");
        setSummary(firstChapter.summary || "");
        setText(firstChapter.text || "");

        // Load chapter-specific data
        const chapterId = firstChapter.id;

        // Load characters (story-level)
        const charsResponse = await api.getCharacters(storyIdNum);
        setCharacters(charsResponse.characters || []);

        // Load beats
        const beatsResponse = await api.getBeats(chapterId);
        setBeats(beatsResponse.beats || []);

        // Load world elements
        const worldResponse = await api.getWorldElements(chapterId);
        setWorldElements(worldResponse.elements || []);

        // Load key events
        const eventsResponse = await api.getKeyEvents(chapterId);
        setKeyEvents(eventsResponse.events || []);
      } else {
        // No chapters - create one
        await api.createChapter(storyIdNum, {
          title: `${storyData.title} - Chapter 1`,
        });
        await loadStory(); // Reload to get the new chapter
      }
    } catch (error) {
      console.error("Failed to load story:", error);
      navigate("/stories");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!storyIdNum || !currentChapter) return;
    try {
      await api.updateChapter(currentChapter.id, {
        title,
        summary,
        text,
      });
    } catch (error) {
      console.error("Failed to save:", error);
    }
  };

  const handleSwitchChapter = async (chapterId: number) => {
    const chapter = story?.chapters?.find((c) => c.id === chapterId);
    if (!chapter) return;

    setCurrentChapter(chapter);
    setTitle(chapter.title || "");
    setSummary(chapter.summary || "");
    setText(chapter.text || "");

    // Reload chapter-specific data
    const beatsResponse = await api.getBeats(chapter.id);
    setBeats(beatsResponse.beats || []);

    const worldResponse = await api.getWorldElements(chapter.id);
    setWorldElements(worldResponse.elements || []);

    const eventsResponse = await api.getKeyEvents(chapter.id);
    setKeyEvents(eventsResponse.events || []);
  };

  const handleAddChapter = async () => {
    if (!storyIdNum) return;
    const newOrder = (story?.chapters?.length || 0) + 1;
    await api.createChapter(storyIdNum, {
      title: `${story?.title} - Chapter ${newOrder}`,
    });
    await loadStory(); // Reload to get updated chapters list
  };

  const handleAddCharacter = async () => {
    if (!newCharName.trim() || !storyIdNum) return;
    try {
      const response = await api.createCharacter(storyIdNum, {
        name: newCharName,
        traits: newCharTraits,
        backstory: newCharBackstory,
      });
      setCharacters([...characters, response.character]);
      setNewCharName("");
      setNewCharTraits("");
      setNewCharBackstory("");
    } catch (error) {
      console.error("Failed to create character:", error);
    }
  };

  const handleAddBeat = async () => {
    if (!newBeatDesc.trim() || !currentChapter?.id) return;
    try {
      const response = await api.createBeat(currentChapter.id, {
        description: newBeatDesc,
        order: newBeatOrder,
      });
      setBeats([...beats, response.beat].sort((a, b) => a.order - b.order));
      setNewBeatDesc("");
      setNewBeatOrder(beats.length + 2);
    } catch (error) {
      console.error("Failed to create beat:", error);
    }
  };

  const handleAddWorldElement = async () => {
    if (!newWorldDesc.trim() || !currentChapter?.id) return;
    try {
      const response = await api.createWorldElement(currentChapter.id, {
        category: newWorldCategory,
        description: newWorldDesc,
      });
      setWorldElements([...worldElements, response.element]);
      setNewWorldDesc("");
    } catch (error) {
      console.error("Failed to create world element:", error);
    }
  };

  const handleAddKeyEvent = async () => {
    if (!newEventDesc.trim() || !currentChapter?.id) return;
    try {
      const response = await api.createKeyEvent(currentChapter.id, {
        description: newEventDesc,
        order: newEventOrder,
      });
      setKeyEvents(
        [...keyEvents, response.event].sort((a, b) => a.order - b.order)
      );
      setNewEventDesc("");
      setNewEventOrder(keyEvents.length + 2);
    } catch (error) {
      console.error("Failed to create key event:", error);
    }
  };

  // Update and Delete functions for Characters
  const handleUpdateCharacter = async (
    charId: number,
    name: string,
    traits: string,
    backstory: string
  ) => {
    if (!storyIdNum) return;
    try {
      await api.updateCharacter(storyIdNum, charId, {
        name,
        traits,
        backstory,
      });
      const charsResponse = await api.getCharacters(storyIdNum);
      setCharacters(charsResponse.characters || []);
      setEditingCharId(null);
    } catch (error) {
      console.error("Failed to update character:", error);
    }
  };

  const handleDeleteCharacter = async (charId: number) => {
    if (
      !storyIdNum ||
      !confirm("Are you sure you want to delete this character?")
    )
      return;
    try {
      await api.deleteCharacter(storyIdNum, charId);
      setCharacters(characters.filter((c) => c.id !== charId));
    } catch (error) {
      console.error("Failed to delete character:", error);
    }
  };

  // Update and Delete functions for Beats
  const handleUpdateBeat = async (
    beatId: number,
    description: string,
    order: number
  ) => {
    if (!currentChapter) return;
    try {
      await api.updateBeat(currentChapter.id, beatId, { description, order });
      const beatsResponse = await api.getBeats(currentChapter.id);
      setBeats(beatsResponse.beats || []);
      setEditingBeatId(null);
    } catch (error) {
      console.error("Failed to update beat:", error);
    }
  };

  const handleDeleteBeat = async (beatId: number) => {
    if (
      !currentChapter ||
      !confirm("Are you sure you want to delete this beat?")
    )
      return;
    try {
      await api.deleteBeat(currentChapter.id, beatId);
      setBeats(beats.filter((b) => b.id !== beatId));
    } catch (error) {
      console.error("Failed to delete beat:", error);
    }
  };

  // Update and Delete functions for World Elements
  const handleUpdateWorldElement = async (
    elemId: number,
    category: string,
    description: string
  ) => {
    if (!currentChapter) return;
    try {
      await api.updateWorldElement(currentChapter.id, elemId, {
        category,
        description,
      });
      const worldResponse = await api.getWorldElements(currentChapter.id);
      setWorldElements(worldResponse.elements || []);
      setEditingWorldId(null);
    } catch (error) {
      console.error("Failed to update world element:", error);
    }
  };

  const handleDeleteWorldElement = async (elemId: number) => {
    if (
      !currentChapter ||
      !confirm("Are you sure you want to delete this world element?")
    )
      return;
    try {
      await api.deleteWorldElement(currentChapter.id, elemId);
      setWorldElements(worldElements.filter((w) => w.id !== elemId));
    } catch (error) {
      console.error("Failed to delete world element:", error);
    }
  };

  // Update and Delete functions for Key Events
  const handleUpdateKeyEvent = async (
    eventId: number,
    description: string,
    order: number
  ) => {
    if (!currentChapter) return;
    try {
      await api.updateKeyEvent(currentChapter.id, eventId, {
        description,
        order,
      });
      const eventsResponse = await api.getKeyEvents(currentChapter.id);
      setKeyEvents(eventsResponse.events || []);
      setEditingEventId(null);
    } catch (error) {
      console.error("Failed to update key event:", error);
    }
  };

  const handleDeleteKeyEvent = async (eventId: number) => {
    if (
      !currentChapter ||
      !confirm("Are you sure you want to delete this key event?")
    )
      return;
    try {
      await api.deleteKeyEvent(currentChapter.id, eventId);
      setKeyEvents(keyEvents.filter((e) => e.id !== eventId));
    } catch (error) {
      console.error("Failed to delete key event:", error);
    }
  };

  const handleGenerateProse = async () => {
    if (!sceneInput.trim() || !currentChapter) return;
    setGeneratingProse(true);
    setAiProseResult("Generating...");

    try {
      // Get last 2000 words of chapter for context
      const chapterWords = (currentChapter.text || "").split(/\s+/);
      const last2000 = chapterWords.slice(-2000).join(" ");

      // Format world elements
      const worldElementsStr =
        worldElements.length > 0
          ? worldElements
              .map((w) => `- ${w.category}: ${w.description}`)
              .join("\n")
          : "None";

      // Format beats/scenes
      const beatsStr =
        beats.length > 0
          ? beats.map((b) => `${b.order}. ${b.description}`).join("\n")
          : "None";

      // Format character info
      const charStr =
        selectedCharsProse.length > 0
          ? selectedCharsProse.join(", ")
          : "no characters";

      // Include chapter summary
      const summaryStr = currentChapter.summary || "No summary available";

      // Include beat generator context if available
      const beatContextStr = beatInput.trim()
        ? `\n\nBeat/Scene Input from Beat Generator:\n${beatInput}`
        : "";
      const beatInstructionsStr =
        beatPrompt !== defaultBeatPrompt
          ? `\n\nBeat Generator Instructions:\n${beatPrompt}`
          : "";

      // Construct prompt matching reference implementation
      const fullPrompt = `${prosePrompt}\n\nChapter Summary:\n${summaryStr}\n\nCharacter Information:\n${charStr}\n\nBeats/Scenes to Expand:\n${beatsStr}\n\nScene Input: ${sceneInput}\n\nRecent chapter context (last 2000 words):\n${last2000}\n\nWorld Building Elements:\n${worldElementsStr}${beatContextStr}${beatInstructionsStr}`;

      // Call AI API
      const response = await fetch(`${API_BASE_URL}/api/ai/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          prompt: fullPrompt,
          type: "prose",
          model: proseModel,
        }),
      });

      const data = await response.json();
      setAiProseResult(data.content || "No response from AI");
    } catch (error) {
      console.error("Failed to generate prose:", error);
      setAiProseResult("Error generating prose. Please try again.");
    } finally {
      setGeneratingProse(false);
    }
  };

  const handleGenerateBeat = async () => {
    if (!beatInput.trim() || !currentChapter) return;
    setGeneratingBeat(true);
    setAiBeatResult("Generating...");

    try {
      // Get last 2000 words of chapter for context
      const chapterWords = (currentChapter.text || "").split(/\s+/);
      const last2000 = chapterWords.slice(-2000).join(" ");

      // Format world elements
      const worldElementsStr =
        worldElements.length > 0
          ? worldElements
              .map((w) => `- ${w.category}: ${w.description}`)
              .join("\n")
          : "None";

      // Format existing beats/scenes
      const beatsStr =
        beats.length > 0
          ? beats.map((b) => `${b.order}. ${b.description}`).join("\n")
          : "None";

      // Format character info
      const charStr =
        selectedCharsBeat.length > 0
          ? selectedCharsBeat.join(", ")
          : "no characters";

      // Include chapter summary
      const summaryStr = currentChapter.summary || "No summary available";

      // Include prose generator context if available
      const proseContextStr = sceneInput.trim()
        ? `\n\nScene Input from Prose Generator:\n${sceneInput}`
        : "";
      const proseInstructionsStr =
        prosePrompt !== defaultProsePrompt
          ? `\n\nProse Generator Instructions:\n${prosePrompt}`
          : "";

      // Construct prompt matching reference implementation
      const fullPrompt = `${beatPrompt}\n\nChapter Summary:\n${summaryStr}\n\nCharacters in scene: ${charStr}\n\nExisting Beats/Scenes:\n${beatsStr}\n\nBeat/Scene Input: ${beatInput}\n\nRecent chapter context (last 2000 words):\n${last2000}\n\nWorld Building Elements:\n${worldElementsStr}${proseContextStr}${proseInstructionsStr}`;

      // Call AI API
      const response = await fetch(`${API_BASE_URL}/api/ai/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          prompt: fullPrompt,
          type: "beat",
          model: beatModel,
        }),
      });

      const data = await response.json();
      setAiBeatResult(data.content || "No response from AI");
    } catch (error) {
      console.error("Failed to generate beat:", error);
      setAiBeatResult("Error generating beat. Please try again.");
    } finally {
      setGeneratingBeat(false);
    }
  };

  const handleSummarizeChapter = async () => {
    if (!text.trim() || !currentChapter) return;
    setSummarizing(true);

    try {
      const response = await api.summarizeChapter(currentChapter.id, text);
      setSummary(response.summary);
    } catch (error) {
      console.error("Failed to summarize chapter:", error);
      alert("Error summarizing chapter. Please try again.");
    } finally {
      setSummarizing(false);
    }
  };

  if (loading) {
    return <div className="loading-screen">Loading story...</div>;
  }

  if (!story) {
    return <div className="loading-screen">Story not found</div>;
  }

  return (
    <div className="story-editor-page">
      <div className="story-editor-container">
        <h2 className="editor-title">Edit Story: {story.title}</h2>
        <Link to="/stories" className="back-link-se">
          ← Back to Stories
        </Link>

        {/* Chapter Switcher */}
        <div className="chapter-switcher">
          <div className="chapter-tabs">
            {story.chapters?.map((chapter) => (
              <button
                key={chapter.id}
                className={`chapter-tab ${
                  currentChapter?.id === chapter.id ? "active" : ""
                }`}
                onClick={() => handleSwitchChapter(chapter.id)}
              >
                {chapter.title}
              </button>
            ))}
            <button
              className="chapter-tab chapter-tab-new"
              onClick={handleAddChapter}
            >
              + New Chapter
            </button>
          </div>
        </div>

        {/* Chapter Form */}
        <form
          className="chapter-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <label className="form-label">Title:</label>
          <input
            type="text"
            className="form-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <label className="form-label">Summary:</label>
          <textarea
            className="form-textarea"
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />

          <label className="form-label">Chapter Text:</label>
          <textarea
            className="form-textarea"
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Start writing your story..."
          />

          <button
            type="button"
            className="btn-summarize"
            onClick={handleSummarizeChapter}
            disabled={summarizing || !text.trim()}
            style={{ marginBottom: "1rem" }}
          >
            {summarizing ? "Summarizing..." : "Summarize Chapter Text"}
          </button>

          <button type="submit" className="btn-save">
            Save Chapter
          </button>
        </form>

        {/* Two-Column AI Generators */}
        <div className="ai-generators-grid">
          {/* Prose Generator */}
          <div className="ai-generator">
            <h3 className="generator-title">AI Prose Generator</h3>
            <label className="form-label">Prompt (edit as needed):</label>
            <textarea
              className="form-textarea"
              rows={4}
              value={prosePrompt}
              onChange={(e) => setProsePrompt(e.target.value)}
              placeholder="Enter prompt for prose generation..."
            />

            <label className="form-label">Scene Input:</label>
            <textarea
              className="form-textarea"
              rows={4}
              value={sceneInput}
              onChange={(e) => setSceneInput(e.target.value)}
              placeholder="Paste or type your chapter text here..."
            />

            <label className="form-label">Characters in Scene:</label>
            <div className="character-checkboxes">
              {characters.map((char) => (
                <label key={char.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedCharsProse.includes(char.name)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCharsProse([
                          ...selectedCharsProse,
                          char.name,
                        ]);
                      } else {
                        setSelectedCharsProse(
                          selectedCharsProse.filter((n) => n !== char.name)
                        );
                      }
                    }}
                  />
                  {char.name}
                </label>
              ))}
            </div>

            <label className="form-label">AI Model:</label>
            <select
              className="form-select"
              value={proseModel}
              onChange={(e) => setProseModel(e.target.value)}
              style={{ marginBottom: "0.5rem" }}
            >
              <option value="anthropic/claude-3.5-sonnet">
                Claude 3.5 Sonnet (Anthropic)
              </option>
              <option value="x-ai/grok-4.1-fast">Grok 4.1 Fast (xAI)</option>
              <option value="deepseek/deepseek-v3.2">
                DeepSeek v3.2 (DeepSeek)
              </option>
              <option value="openai/gpt-oss-120b">GPT-OSS-120B (OpenAI)</option>
              <option value="google/gemini-2.5-flash">
                Gemini 2.5 Flash (Google)
              </option>
              <option value="moonshotai/kimi-k2">MoonshotAI Kimi K2</option>
            </select>

            <button
              className="btn-generate"
              onClick={handleGenerateProse}
              disabled={generatingProse || !sceneInput.trim()}
            >
              {generatingProse ? "Generating..." : "Generate Prose"}
            </button>
            <textarea
              className="form-textarea ai-result"
              rows={6}
              value={aiProseResult}
              readOnly
            />
          </div>

          {/* Beat/Scene Generator */}
          <div className="ai-generator">
            <h3 className="generator-title">Beat/Scene AI Generator</h3>
            <label className="form-label">Prompt (edit as needed):</label>
            <textarea
              className="form-textarea"
              rows={10}
              value={beatPrompt}
              onChange={(e) => setBeatPrompt(e.target.value)}
              placeholder="Enter prompt for beat/scene expansion..."
            />

            <label className="form-label">Beat/Scene Input:</label>
            <textarea
              className="form-textarea"
              rows={4}
              value={beatInput}
              onChange={(e) => setBeatInput(e.target.value)}
              placeholder="Paste or type your beats/scenes here..."
            />

            <label className="form-label">Characters Detected:</label>
            <div className="character-checkboxes">
              {characters.map((char) => (
                <label key={char.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedCharsBeat.includes(char.name)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCharsBeat([...selectedCharsBeat, char.name]);
                      } else {
                        setSelectedCharsBeat(
                          selectedCharsBeat.filter((n) => n !== char.name)
                        );
                      }
                    }}
                  />
                  {char.name}
                </label>
              ))}
            </div>

            <label className="form-label">AI Model:</label>
            <select
              className="form-select"
              value={beatModel}
              onChange={(e) => setBeatModel(e.target.value)}
              style={{ marginBottom: "0.5rem" }}
            >
              <option value="anthropic/claude-3.5-sonnet">
                Claude 3.5 Sonnet (Anthropic)
              </option>
              <option value="x-ai/grok-4.1-fast">Grok 4.1 Fast (xAI)</option>
              <option value="deepseek/deepseek-v3.2">
                DeepSeek v3.2 (DeepSeek)
              </option>
              <option value="openai/gpt-oss-120b">GPT-OSS-120B (OpenAI)</option>
              <option value="google/gemini-2.5-flash">
                Gemini 2.5 Flash (Google)
              </option>
              <option value="moonshotai/kimi-k2">MoonshotAI Kimi K2</option>
            </select>

            <button
              className="btn-generate"
              onClick={handleGenerateBeat}
              disabled={generatingBeat || !beatInput.trim()}
            >
              {generatingBeat ? "Generating..." : "Expand Beat/Scene"}
            </button>
            <textarea
              className="form-textarea ai-result"
              rows={6}
              value={aiBeatResult}
              readOnly
            />
          </div>
        </div>

        <hr className="section-divider" />

        {/* Beats/Scenes Section */}
        <h3 className="section-title">Beats/Scenes</h3>
        <ul className="item-list">
          {beats.map((beat) => (
            <li
              key={beat.id}
              className="item"
              style={{ flexDirection: "column", alignItems: "stretch" }}
            >
              {editingBeatId === beat.id ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <label className="form-label">Order:</label>
                  <input
                    type="number"
                    className="form-input-small"
                    defaultValue={beat.order}
                    id={`beat-order-${beat.id}`}
                  />
                  <label className="form-label">Description:</label>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    defaultValue={beat.description}
                    id={`beat-desc-${beat.id}`}
                  />
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      className="btn-save"
                      onClick={() => {
                        const order = parseInt(
                          (
                            document.getElementById(
                              `beat-order-${beat.id}`
                            ) as HTMLInputElement
                          ).value
                        );
                        const desc = (
                          document.getElementById(
                            `beat-desc-${beat.id}`
                          ) as HTMLTextAreaElement
                        ).value;
                        handleUpdateBeat(beat.id, desc, order);
                      }}
                    >
                      Save
                    </button>
                    <button
                      className="btn-cancel"
                      onClick={() => setEditingBeatId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>
                    {beat.order}. {beat.description}
                  </span>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      className="btn-edit"
                      onClick={() => setEditingBeatId(beat.id)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-delete"
                      onClick={() => handleDeleteBeat(beat.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {beats.length === 0 && (
            <li className="no-items">No beats/scenes yet.</li>
          )}
        </ul>
        <div className="add-form">
          <label className="form-label">Beat Number:</label>
          <input
            type="number"
            className="form-input-small"
            value={newBeatOrder}
            onChange={(e) => setNewBeatOrder(parseInt(e.target.value))}
          />
          <label className="form-label">Description:</label>
          <textarea
            className="form-textarea"
            rows={2}
            value={newBeatDesc}
            onChange={(e) => setNewBeatDesc(e.target.value)}
          />
          <button className="btn-add" onClick={handleAddBeat}>
            Add Beat/Scene
          </button>
        </div>

        <hr className="section-divider" />

        {/* World Building Section */}
        <h3 className="section-title">World Building Elements</h3>
        <div className="add-form">
          <label className="form-label">Category:</label>
          <select
            className="form-select"
            value={newWorldCategory}
            onChange={(e) => setNewWorldCategory(e.target.value)}
          >
            <option value="Settings">Settings</option>
            <option value="Cultures">Cultures</option>
            <option value="Magic and Tech">Magic and Tech</option>
            <option value="History">History</option>
            <option value="Races">Races</option>
          </select>
          <label className="form-label">Description:</label>
          <textarea
            className="form-textarea"
            rows={2}
            value={newWorldDesc}
            onChange={(e) => setNewWorldDesc(e.target.value)}
          />
          <button className="btn-add" onClick={handleAddWorldElement}>
            Add Element
          </button>
        </div>
        <ul className="item-list">
          {worldElements.map((elem) => (
            <li
              key={elem.id}
              className="item"
              style={{ flexDirection: "column", alignItems: "stretch" }}
            >
              {editingWorldId === elem.id ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <label className="form-label">Category:</label>
                  <select
                    className="form-select"
                    defaultValue={elem.category}
                    id={`world-cat-${elem.id}`}
                  >
                    <option value="Settings">Settings</option>
                    <option value="Cultures">Cultures</option>
                    <option value="Magic and Tech">Magic and Tech</option>
                    <option value="History">History</option>
                    <option value="Races">Races</option>
                  </select>
                  <label className="form-label">Description:</label>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    defaultValue={elem.description}
                    id={`world-desc-${elem.id}`}
                  />
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      className="btn-save"
                      onClick={() => {
                        const category = (
                          document.getElementById(
                            `world-cat-${elem.id}`
                          ) as HTMLSelectElement
                        ).value;
                        const desc = (
                          document.getElementById(
                            `world-desc-${elem.id}`
                          ) as HTMLTextAreaElement
                        ).value;
                        handleUpdateWorldElement(elem.id, category, desc);
                      }}
                    >
                      Save
                    </button>
                    <button
                      className="btn-cancel"
                      onClick={() => setEditingWorldId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>
                    <strong>{elem.category}:</strong> {elem.description}
                  </span>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      className="btn-edit"
                      onClick={() => setEditingWorldId(elem.id)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-delete"
                      onClick={() => handleDeleteWorldElement(elem.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {worldElements.length === 0 && (
            <li className="no-items">No world building elements yet.</li>
          )}
        </ul>

        <hr className="section-divider" />

        {/* Characters Section */}
        <h3 className="section-title">Characters</h3>
        <div className="add-form">
          <label className="form-label">Name:</label>
          <input
            type="text"
            className="form-input"
            value={newCharName}
            onChange={(e) => setNewCharName(e.target.value)}
          />
          <label className="form-label">Traits:</label>
          <textarea
            className="form-textarea"
            rows={2}
            value={newCharTraits}
            onChange={(e) => setNewCharTraits(e.target.value)}
          />
          <label className="form-label">Backstory:</label>
          <textarea
            className="form-textarea"
            rows={2}
            value={newCharBackstory}
            onChange={(e) => setNewCharBackstory(e.target.value)}
          />
          <button className="btn-add" onClick={handleAddCharacter}>
            Add Character
          </button>
        </div>
        <ul className="item-list">
          {characters.map((char) => (
            <li
              key={char.id}
              className="item"
              style={{ flexDirection: "column", alignItems: "stretch" }}
            >
              {editingCharId === char.id ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <label className="form-label">Name:</label>
                  <input
                    type="text"
                    className="form-input"
                    defaultValue={char.name}
                    id={`char-name-${char.id}`}
                  />
                  <label className="form-label">Traits:</label>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    defaultValue={char.traits || ""}
                    id={`char-traits-${char.id}`}
                  />
                  <label className="form-label">Backstory:</label>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    defaultValue={char.backstory || ""}
                    id={`char-back-${char.id}`}
                  />
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      className="btn-save"
                      onClick={() => {
                        const name = (
                          document.getElementById(
                            `char-name-${char.id}`
                          ) as HTMLInputElement
                        ).value;
                        const traits = (
                          document.getElementById(
                            `char-traits-${char.id}`
                          ) as HTMLTextAreaElement
                        ).value;
                        const backstory = (
                          document.getElementById(
                            `char-back-${char.id}`
                          ) as HTMLTextAreaElement
                        ).value;
                        handleUpdateCharacter(char.id, name, traits, backstory);
                      }}
                    >
                      Save
                    </button>
                    <button
                      className="btn-cancel"
                      onClick={() => setEditingCharId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <strong>{char.name}</strong>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        className="btn-edit"
                        onClick={() => setEditingCharId(char.id)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => handleDeleteCharacter(char.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {char.traits && (
                    <div className="item-detail">Traits: {char.traits}</div>
                  )}
                  {char.backstory && (
                    <div className="item-detail">
                      Backstory: {char.backstory}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
          {characters.length === 0 && (
            <li className="no-items">No characters yet.</li>
          )}
        </ul>

        <hr className="section-divider" />

        {/* Key Events Section */}
        <h3 className="section-title">Key Events</h3>
        <div className="add-form">
          <label className="form-label">Description:</label>
          <textarea
            className="form-textarea"
            rows={2}
            value={newEventDesc}
            onChange={(e) => setNewEventDesc(e.target.value)}
          />
          <label className="form-label">Order:</label>
          <input
            type="number"
            className="form-input-small"
            value={newEventOrder}
            onChange={(e) => setNewEventOrder(parseInt(e.target.value))}
          />
          <button className="btn-add" onClick={handleAddKeyEvent}>
            Add Key Event
          </button>
        </div>
        <ul className="item-list">
          {keyEvents.map((event) => (
            <li
              key={event.id}
              className="item"
              style={{ flexDirection: "column", alignItems: "stretch" }}
            >
              {editingEventId === event.id ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <label className="form-label">Order:</label>
                  <input
                    type="number"
                    className="form-input-small"
                    defaultValue={event.order}
                    id={`event-order-${event.id}`}
                  />
                  <label className="form-label">Description:</label>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    defaultValue={event.description}
                    id={`event-desc-${event.id}`}
                  />
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      className="btn-save"
                      onClick={() => {
                        const order = parseInt(
                          (
                            document.getElementById(
                              `event-order-${event.id}`
                            ) as HTMLInputElement
                          ).value
                        );
                        const desc = (
                          document.getElementById(
                            `event-desc-${event.id}`
                          ) as HTMLTextAreaElement
                        ).value;
                        handleUpdateKeyEvent(event.id, desc, order);
                      }}
                    >
                      Save
                    </button>
                    <button
                      className="btn-cancel"
                      onClick={() => setEditingEventId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>
                    {event.order}. {event.description}
                  </span>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      className="btn-edit"
                      onClick={() => setEditingEventId(event.id)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-delete"
                      onClick={() => handleDeleteKeyEvent(event.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {keyEvents.length === 0 && (
            <li className="no-items">No key events yet.</li>
          )}
        </ul>

        <hr className="section-divider" />

        {/* AI Context Inspector - Moved to bottom as troubleshooting tool */}
        <div
          className="ai-generator"
          style={{
            marginBottom: "1.5rem",
            background: "var(--color-bg-tertiary, #252541)",
            padding: "1rem",
            borderRadius: "0.5rem",
          }}
        >
          <h3 className="generator-title">
            📋 AI Context Inspector (Troubleshooting)
          </h3>
          <p
            style={{
              color: "var(--color-text-secondary, #9ca3af)",
              marginBottom: "1rem",
              fontSize: "0.875rem",
            }}
          >
            This shows what data the AI generators have access to for this
            chapter:
          </p>
          <div
            style={{
              background: "var(--color-bg-secondary, #1a1a2e)",
              padding: "1rem",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontFamily: "monospace",
              overflowX: "auto",
            }}
          >
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {`Story: ${story.title}
Current Chapter: ${currentChapter?.title || "None"}

Characters (${characters.length}):
${
  characters
    .map(
      (c) =>
        `  - ${c.name}${c.traits ? `\n    Traits: ${c.traits}` : ""}${
          c.backstory ? `\n    Backstory: ${c.backstory}` : ""
        }`
    )
    .join("\n") || "  (none)"
}

Beats/Scenes (${beats.length}):
${beats.map((b) => `  ${b.order}. ${b.description}`).join("\n") || "  (none)"}

World Building Elements (${worldElements.length}):
${
  worldElements.map((w) => `  [${w.category}] ${w.description}`).join("\n") ||
  "  (none)"
}

Key Events (${keyEvents.length}):
${
  keyEvents.map((e) => `  ${e.order}. ${e.description}`).join("\n") ||
  "  (none)"
}

Chapter Text (${(currentChapter?.text || "").length} chars):
${(currentChapter?.text || "(empty)").substring(0, 200)}${
                (currentChapter?.text || "").length > 200 ? "..." : ""
              }`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
