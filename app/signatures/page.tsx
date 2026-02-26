"use client";

import { useState, useEffect, useCallback } from "react";

interface Signature {
  id: number;
  name: string;
  content: string;
  isDefault: boolean;
  createdAt: string;
}

export default function SignaturesPage() {
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // New signature form
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newIsDefault, setNewIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/signatures");
    setSignatures(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit(sig: Signature) {
    setEditingId(sig.id);
    setEditName(sig.name);
    setEditContent(sig.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditContent("");
  }

  async function saveEdit(id: number) {
    setSaving(true);
    await fetch("/api/signatures", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: editName, content: editContent }),
    });
    cancelEdit();
    setSaving(false);
    load();
  }

  async function createSignature() {
    if (!newName.trim() || !newContent.trim()) return;
    setSaving(true);
    await fetch("/api/signatures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, content: newContent, isDefault: newIsDefault }),
    });
    setNewName("");
    setNewContent("");
    setNewIsDefault(false);
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function setDefault(id: number) {
    await fetch("/api/signatures", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isDefault: true }),
    });
    load();
  }

  async function deleteSig(id: number) {
    await fetch("/api/signatures", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Signatures</h1>
          <p className="text-[#666] text-sm mt-1">
            Custom footers appended to your generated content — links, credits, CTAs.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors"
        >
          + New signature
        </button>
      </div>

      {/* Branding note */}
      <div className="bg-[#111] border border-[#1e1e1e] rounded-xl px-5 py-4 flex items-start gap-3">
        <div className="w-1.5 h-1.5 rounded-full bg-[#555] shrink-0 mt-1.5" />
        <p className="text-xs text-[#555] leading-relaxed">
          All content generated on the free tier includes a{" "}
          <span className="text-[#888]">
            &ldquo;Written by me, powered by Ghostwrite&rdquo;
          </span>{" "}
          attribution by default. You can customise the text or add your own signatures on top of it.
        </p>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
          <h2 className="font-medium text-white">New Signature</h2>
          <input
            type="text"
            placeholder="Name (e.g. Newsletter footer, Twitter bio link)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#444]"
          />
          <div className="space-y-1.5">
            <label className="text-xs text-[#555]">
              Content — plain text, links, emoji are all fine
            </label>
            <textarea
              placeholder={"---\n\nFollow me on Twitter: @yourhandle\nBuilding in public at yoursite.com"}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={5}
              className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#555] font-mono focus:outline-none focus:border-[#444] resize-y"
            />
          </div>

          {/* Preview */}
          {newContent && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-[#555] uppercase tracking-widest">
                Preview
              </div>
              <div className="bg-[#0f0f0f] border border-[#222] rounded-lg px-4 py-3">
                <pre className="text-xs text-[#888] whitespace-pre-wrap font-sans leading-relaxed">
                  {newContent}
                </pre>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <div
              onClick={() => setNewIsDefault(!newIsDefault)}
              className={`w-8 h-4 rounded-full transition-colors relative ${
                newIsDefault ? "bg-white" : "bg-[#333]"
              }`}
            >
              <div
                className={`absolute top-0.5 w-3 h-3 rounded-full transition-transform bg-black ${
                  newIsDefault ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </div>
            <span className="text-sm text-[#888]">Set as default signature</span>
          </label>

          <div className="flex items-center gap-3">
            <button
              onClick={createSignature}
              disabled={saving || !newName.trim() || !newContent.trim()}
              className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save signature"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-[#666] text-sm hover:text-[#999] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Signature list */}
      {signatures.length === 0 ? (
        <div className="text-center py-16 text-[#444] text-sm">
          No signatures yet.
        </div>
      ) : (
        <div className="space-y-3">
          {signatures.map((sig) => (
            <div
              key={sig.id}
              className="bg-[#161616] border border-[#222] rounded-xl overflow-hidden"
            >
              {editingId === sig.id ? (
                /* Edit mode */
                <div className="p-5 space-y-4">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#444]"
                  />
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={5}
                    className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#444] resize-y"
                  />
                  {editContent && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-[#555] uppercase tracking-widest">
                        Preview
                      </div>
                      <div className="bg-[#0f0f0f] border border-[#222] rounded-lg px-4 py-3">
                        <pre className="text-xs text-[#888] whitespace-pre-wrap font-sans leading-relaxed">
                          {editContent}
                        </pre>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => saveEdit(sig.id)}
                      disabled={saving}
                      className="bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#e8e8e8] transition-colors disabled:opacity-40"
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="text-[#666] text-sm hover:text-[#999] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-white text-sm">{sig.name}</span>
                        {sig.isDefault && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-400 border border-emerald-400/30">
                            Default
                          </span>
                        )}
                      </div>
                      <pre className="text-xs text-[#555] whitespace-pre-wrap font-sans leading-relaxed mt-2 line-clamp-3">
                        {sig.content}
                      </pre>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!sig.isDefault && (
                        <button
                          onClick={() => setDefault(sig.id)}
                          className="text-[#444] hover:text-[#888] transition-colors text-xs"
                        >
                          Set default
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(sig)}
                        className="text-[#444] hover:text-white transition-colors text-xs"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteSig(sig.id)}
                        className="text-[#444] hover:text-red-400 transition-colors text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
