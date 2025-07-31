import {
  $,
  component$,
  useVisibleTask$,
  useTask$,
  useStore,
} from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";

/**
 * ENV variable used: VITE_NOTES_API_URL
 * 
 * CRUD is done to `${import.meta.env.VITE_NOTES_API_URL}/notes`
 * 
 * Note: Make sure to set VITE_NOTES_API_URL, e.g. http://localhost:8000/api
 */

type Note = {
  id: string;
  title: string;
  content: string;
  updated_at: string;
};

const getApiUrl = () =>
  (import.meta as any).env.VITE_NOTES_API_URL as string;

function getShort(text = "", max = 35) {
  return text.length > max ? text.slice(0, max - 3) + "..." : text;
}

// PUBLIC_INTERFACE
export default component$(() => {
  const state = useStore<{
    notes: Note[];
    selectedId?: string;
    loading: boolean;
    error: string | null;
    createMode: boolean;
    noteDraft: { title: string; content: string };
    confirmDelete: string | null;
    saving: boolean;
  }>({
    notes: [],
    selectedId: undefined,
    loading: false,
    error: null,
    createMode: false,
    noteDraft: { title: "", content: "" },
    confirmDelete: null,
    saving: false,
  });

  // Fetch all notes
  const fetchNotes = $(() => {
    state.loading = true;
    state.error = null;
    fetch(`${getApiUrl()}/notes`)
      .then((res) => res.json())
      .then((data) => {
        state.notes = Array.isArray(data) ? data : [];
        // If selected ID was deleted, auto-select the first
        if (
          state.selectedId &&
          !state.notes.find((n) => n.id === state.selectedId)
        ) {
          state.selectedId = state.notes[0]?.id;
        }
      })
      .catch(() => {
        state.error =
          "Failed to load notes. Check API connection and env (VITE_NOTES_API_URL).";
      })
      .finally(() => (state.loading = false));
  });

  // Fetch notes on mount
  useVisibleTask$(() => {
    fetchNotes();
  });

  // Load note when selectedId changes (for editing mode)
  useTask$(({ track }) => {
    track(() => state.selectedId);
    if (!state.createMode && state.selectedId) {
      const note = state.notes.find((n) => n.id === state.selectedId);
      if (note) {
        state.noteDraft.title = note.title;
        state.noteDraft.content = note.content;
      }
    }
  });

  const selectNote = $((id: string) => {
    state.selectedId = id;
    state.createMode = false;
    state.confirmDelete = null;
    // Draft is reset via useTask$
  });

  const startCreate = $(() => {
    state.noteDraft = { title: "", content: "" };
    state.createMode = true;
    state.selectedId = undefined;
    state.confirmDelete = null;
  });

  const saveNote = $(async () => {
    if (!state.noteDraft.title.trim()) {
      state.error = "Title is required";
      return;
    }
    state.saving = true;
    state.error = null;
    try {
      if (state.createMode) {
        // Create
        const resp = await fetch(`${getApiUrl()}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(state.noteDraft),
        });
        if (!resp.ok) throw new Error("Failed to create note");
      } else if (state.selectedId) {
        // Update
        const resp = await fetch(
          `${getApiUrl()}/notes/${state.selectedId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(state.noteDraft),
          }
        );
        if (!resp.ok) throw new Error("Failed to update note");
      }
      await fetchNotes();
      // Select the updated/created note
      const updated =
        state.createMode && state.notes.length
          ? state.notes[state.notes.length - 1]
          : state.notes.find((n) => n.id === state.selectedId);
      if (updated) selectNote(updated.id);
      state.createMode = false;
    } catch {
      state.error = "Save failed";
    }
    state.saving = false;
  });

  const confirmDelete = $((id: string) => {
    state.confirmDelete = id;
  });

  const deleteNote = $(async (id: string) => {
    state.saving = true;
    try {
      const resp = await fetch(`${getApiUrl()}/notes/${id}`, {
        method: "DELETE",
      });
      if (!resp.ok) throw new Error("Failed to delete");
      await fetchNotes();
      // Auto-select first note after delete
      if (state.notes.length) {
        selectNote(state.notes[0].id);
      } else {
        state.selectedId = undefined;
      }
    } catch {
      state.error = "Delete failed";
    }
    state.confirmDelete = null;
    state.saving = false;
  });

  return (
    <div class="notes-app-root">
      <aside class="sidebar">
        <header class="sidebar-header">
          <h2>My Notes</h2>
          <button
            class="btn-accent"
            onClick$={startCreate}
            title="New note"
            aria-label="New note"
          >
            + New
          </button>
        </header>
        {state.loading ? (
          <div class="sidebar-loading">Loading notes...</div>
        ) : state.error ? (
          <div class="sidebar-error">{state.error}</div>
        ) : (
          <ul class="notes-list">
            {state.notes.map((note) => (
              <li
                key={note.id}
                class={[
                  state.selectedId === note.id && !state.createMode
                    ? "active"
                    : "",
                ]}
              >
                <button
                  class="note-list-btn"
                  onClick$={() => selectNote(note.id)}
                >
                  <span class="note-title">{getShort(note.title, 27) || <em>(Untitled)</em>}</span>
                </button>
                <button
                  class="delete-btn"
                  onClick$={() => confirmDelete(note.id)}
                  title="Delete"
                  aria-label={`Delete ${note.title}`}
                >
                  🗑️
                </button>
                {state.confirmDelete === note.id && (
                  <span class="delete-confirm">
                    <span>Delete?</span>
                    <button
                      class="btn-danger"
                      onClick$={() => deleteNote(note.id)}
                    >Yes</button>
                    <button
                      class="btn-accent"
                      onClick$={() => (state.confirmDelete = null)}
                    >No</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </aside>
      <main class="main-area">
        {state.createMode ? (
            <>
              <NoteEditor noteStore={state} saving={state.saving} />
              <div class="note-editor-actions" style="max-width:700px;margin:0 auto;">
                <button
                  type="button"
                  class="btn-primary"
                  disabled={state.saving}
                  onClick$={saveNote}
                >
                  {state.saving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  class="btn-secondary"
                  disabled={state.saving}
                  onClick$={() => {
                    state.createMode = false;
                    state.noteDraft = { title: "", content: "" };
                    if (state.notes.length) selectNote(state.notes[0].id);
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
        ) : state.selectedId ? (
          <NoteViewer
            note={
              state.notes.find((n) => n.id === state.selectedId) ||
              ({} as Note)
            }
          />
        ) : (
          <div class="no-note">
            <p>Select or create a note to get started.</p>
          </div>
        )
      }
      {/* Note editing UI */}
      {!state.createMode &&
        state.selectedId &&
        state.notes.find((n) => n.id === state.selectedId) && (
          <button
            class="btn-accent edit-note-btn"
            onClick$={() => {
              state.createMode = true;
              state.noteDraft = {
                title:
                  state.notes.find((n) => n.id === state.selectedId)?.title ||
                  "",
                content:
                  state.notes.find((n) => n.id === state.selectedId)?.content ||
                  "",
              };
            }}
            style={{ marginTop: "1.5rem" }}
          >
            Edit Note
          </button>
        )}
    </main>
  </div>
  );
});

export const head: DocumentHead = {
  title: "Notes",
  meta: [
    {
      name: "description",
      content: "Minimal notes webapp in Qwik",
    },
  ],
};

/**
 * Note Editor component
 */
// PUBLIC_INTERFACE
export const NoteEditor = component$<{
  noteStore: { noteDraft: { title: string; content: string } };
  saving: boolean;
}>((props) => {
  const handleTitleInput = $((ev: InputEvent) => {
    const inputDom = ev.target as HTMLInputElement;
    props.noteStore.noteDraft.title = inputDom.value;
  });
  const handleContentInput = $((ev: InputEvent) => {
    const textareaDom = ev.target as HTMLTextAreaElement;
    props.noteStore.noteDraft.content = textareaDom.value;
  });
  return (
    <form class="note-editor" autocomplete="off">
      <input
        class="note-editor-title"
        placeholder="Title"
        type="text"
        value={props.noteStore.noteDraft.title}
        onInput$={handleTitleInput}
        required
        maxLength={64}
        disabled={props.saving}
      />
      <textarea
        class="note-editor-content"
        placeholder="Your note..."
        value={props.noteStore.noteDraft.content}
        onInput$={handleContentInput}
        rows={12}
        disabled={props.saving}
        maxLength={2000}
      />
    </form>
  );
});

/**
 * Note Viewer component
 */
// PUBLIC_INTERFACE
export const NoteViewer = component$<{
  note: Note;
  [key: string]: any;
}>(({ note }) => (
  <div class="note-viewer">
    <h2 class="note-title-viewer">
      {note.title || <em>(Untitled)</em>}
    </h2>
    <p class="note-date">
      {note.updated_at
        ? "Last edited: " + new Date(note.updated_at).toLocaleString()
        : ""}
    </p>
    <pre class="note-content-viewer">
      {note.content || <em>(No content)</em>}
    </pre>
  </div>
));
