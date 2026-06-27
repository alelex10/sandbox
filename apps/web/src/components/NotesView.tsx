import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SubscriptionMethod, NoteResponse } from "shared";
import { listNotes, createNote, updateNote, deleteNote } from "../api.js";

// ---------------------------------------------------------------------------
// MarkdownRenderer — shared by full view and editor preview
// ---------------------------------------------------------------------------

function MarkdownRenderer({ children }: { children: string }) {
  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NoteCard — presentational card in the left sidebar list
// ---------------------------------------------------------------------------

function NoteCard({
  note,
  selected,
  onSelect,
  onDelete,
}: {
  note: NoteResponse;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  // Strip markdown syntax for the plain-text preview
  const preview = note.body
    .replace(/[#*`_>[\]!]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return (
    <li className="relative group">
      <button
        type="button"
        onClick={onSelect}
        className={[
          "w-full text-left px-4 py-3 text-xs hover:bg-gray-50 transition-colors pr-8",
          selected ? "bg-blue-50 border-l-2 border-blue-500" : "",
        ].join(" ")}
      >
        <div className="font-medium text-gray-800 truncate">{note.title}</div>
        <div className="text-gray-500 mt-0.5 line-clamp-2">{preview}</div>
        <div className="text-gray-400 mt-1">
          {new Date(note.createdAt).toLocaleDateString()}
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete note (soft-delete)"
        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all p-1"
      >
        🗑
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// NoteEditor — controlled create/edit form with Edit/Preview tab
// ---------------------------------------------------------------------------

function NoteEditor({
  initialTitle = "",
  initialBody = "",
  submitting,
  onSubmit,
  onCancel,
}: {
  initialTitle?: string;
  initialBody?: string;
  submitting: boolean;
  onSubmit: (title: string, body: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [titleError, setTitleError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length === 0) {
      setTitleError("Title is required.");
      return;
    }
    setTitleError(null);
    onSubmit(title, body);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (titleError) setTitleError(null);
          }}
          maxLength={200}
          placeholder="Note title"
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {titleError && (
          <p className="mt-1 text-xs text-red-600">{titleError}</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700">Body (Markdown)</label>
          <div
            role="tablist"
            className="inline-flex rounded border border-gray-300 bg-gray-100 p-0.5 gap-0.5"
          >
            {(["edit", "preview"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={[
                  "px-3 py-0.5 rounded text-xs font-medium transition-colors",
                  tab === t
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700",
                ].join(" ")}
              >
                {t === "edit" ? "Edit" : "Preview"}
              </button>
            ))}
          </div>
        </div>

        {tab === "edit" ? (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="Write markdown here…"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        ) : (
          <div className="min-h-[10rem] border border-gray-200 rounded px-3 py-2 bg-white">
            {body.trim() ? (
              <MarkdownRenderer>{body}</MarkdownRenderer>
            ) : (
              <p className="text-xs text-gray-400 italic">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="bg-white border border-gray-300 text-gray-700 rounded px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// NotesView — container component: master-detail grid
// ---------------------------------------------------------------------------

type Mode = "view" | "create" | "edit";

interface NotesViewProps {
  method: SubscriptionMethod;
}

export function NotesView({ method }: NotesViewProps) {
  const [notes, setNotes] = useState<NoteResponse[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listNotes(method);
      setNotes(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notes");
    } finally {
      setLoading(false);
    }
  }, [method]);

  useEffect(() => {
    void fetchNotes();
  }, [fetchNotes]);

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null;

  async function handleCreate(title: string, body: string) {
    setSubmitting(true);
    setError(null);
    try {
      const created = await createNote({ method, title, body });
      await fetchNotes();
      setSelectedId(created.id);
      setMode("view");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create note");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(title: string, body: string) {
    if (!selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateNote(selectedId, { title, body });
      await fetchNotes();
      setMode("view");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update note");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (
      !window.confirm(
        "Delete this note? (soft-delete — data is preserved)",
      )
    )
      return;
    try {
      await deleteNote(id);
      await fetchNotes();
      if (selectedId === id) {
        setSelectedId(null);
        setMode("view");
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete note");
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-6">
      {/* ── Left sidebar ── */}
      <aside className="space-y-2">
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              Notes{" "}
              <span className="text-xs font-normal text-gray-400">({notes.length})</span>
            </h3>
            <button
              type="button"
              onClick={() => {
                setMode("create");
                setSelectedId(null);
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              + New note
            </button>
          </div>

          {loading ? (
            <p className="px-4 py-3 text-xs text-gray-400 italic">Loading…</p>
          ) : (
            <ul className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {notes.length === 0 && (
                <li className="px-4 py-3 text-xs text-gray-400 italic">No notes yet.</li>
              )}
              {notes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  selected={selectedId === note.id}
                  onSelect={() => {
                    setSelectedId(note.id);
                    setMode("view");
                  }}
                  onDelete={() => void handleDelete(note.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* ── Right detail/editor column ── */}
      <div className="min-w-0">
        {error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        {mode === "create" && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-4">New note</h4>
            <NoteEditor
              submitting={submitting}
              onSubmit={handleCreate}
              onCancel={() => setMode("view")}
            />
          </div>
        )}

        {mode === "edit" && selectedNote && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-4">Edit note</h4>
            <NoteEditor
              initialTitle={selectedNote.title}
              initialBody={selectedNote.body}
              submitting={submitting}
              onSubmit={handleUpdate}
              onCancel={() => setMode("view")}
            />
          </div>
        )}

        {mode === "view" && selectedNote && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <h4 className="text-base font-semibold text-gray-900">{selectedNote.title}</h4>
              <button
                type="button"
                onClick={() => setMode("edit")}
                className="shrink-0 text-xs text-gray-500 hover:text-gray-800 border border-gray-300 rounded px-3 py-1 transition-colors"
              >
                Edit
              </button>
            </div>
            <div className="text-xs text-gray-400">
              Created {new Date(selectedNote.createdAt).toLocaleString()} · Updated{" "}
              {new Date(selectedNote.updatedAt).toLocaleString()}
            </div>
            <hr className="border-gray-100" />
            <MarkdownRenderer>{selectedNote.body}</MarkdownRenderer>
          </div>
        )}

        {mode === "view" && !selectedNote && (
          <p className="text-sm text-gray-400 italic">
            Select a note from the sidebar or create a new one.
          </p>
        )}
      </div>
    </div>
  );
}
