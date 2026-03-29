"use client";

import { useState, useEffect, useCallback } from "react";
import { DiscogsRelease, Playlist } from "@/lib/discogs";

// ── helpers ──────────────────────────────────────────────────────────────────

function getGenres(releases: DiscogsRelease[]): string[] {
  const set = new Set<string>();
  for (const r of releases)
    for (const g of r.basic_information.genres) set.add(g);
  return Array.from(set).sort();
}

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── sub-components ────────────────────────────────────────────────────────────

function RecordCard({
  release,
  inPlaylist,
  onToggle,
}: {
  release: DiscogsRelease;
  inPlaylist: boolean;
  onToggle: () => void;
}) {
  const info = release.basic_information;
  const artist = info.artists.map((a) => a.name.replace(/ \(\d+\)$/, "")).join(", ");

  return (
    <div
      className={`flex gap-3 rounded-lg border p-3 transition-colors ${
        inPlaylist
          ? "border-amber-500 bg-amber-950/30"
          : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
      }`}
    >
      {info.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={info.thumb}
          alt={info.title}
          className="h-14 w-14 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-zinc-800 text-2xl">
          ♪
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-zinc-100">{info.title}</p>
        <p className="truncate text-sm text-zinc-400">{artist}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {info.genres.map((g) => (
            <span
              key={g}
              className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400"
            >
              {g}
            </span>
          ))}
          {info.styles.slice(0, 2).map((s) => (
            <span
              key={s}
              className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500"
            >
              {s}
            </span>
          ))}
        </div>
      </div>
      <button
        onClick={onToggle}
        title={inPlaylist ? "Remove from playlist" : "Add to playlist"}
        className={`shrink-0 self-center rounded-full p-2 text-lg transition-colors ${
          inPlaylist
            ? "bg-amber-500 text-zinc-950 hover:bg-amber-400"
            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
        }`}
      >
        {inPlaylist ? "−" : "+"}
      </button>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

type View = "collection" | "playlists";

export default function Home() {
  // credentials
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [savedCreds, setSavedCreds] = useState<{ username: string; token: string } | null>(null);

  // collection data
  const [releases, setReleases] = useState<DiscogsRelease[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [error, setError] = useState("");

  // ui state
  const [view, setView] = useState<View>("collection");
  const [selectedGenre, setSelectedGenre] = useState<string>("All");
  const [search, setSearch] = useState("");

  // playlists
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [playlistModal, setPlaylistModal] = useState(false);

  // load persisted data
  useEffect(() => {
    setSavedCreds(loadFromStorage("discogs_creds", null));
    setReleases(loadFromStorage("discogs_releases", []));
    setPlaylists(loadFromStorage("discogs_playlists", []));
  }, []);

  const fetchCollection = useCallback(async (user: string, tok: string) => {
    setLoading(true);
    setError("");
    setProgress({ loaded: 0, total: 0 });

    try {
      // first page to get total
      const firstRes = await fetch(
        `/api/discogs?username=${encodeURIComponent(user)}&token=${encodeURIComponent(tok)}&page=1&per_page=100`
      );
      const first = await firstRes.json();
      if (!firstRes.ok) throw new Error(first.error || "Failed to fetch collection");

      const all: DiscogsRelease[] = [...first.releases];
      const pages: number = first.pagination.pages;
      const total: number = first.pagination.items;
      setProgress({ loaded: all.length, total });

      for (let p = 2; p <= pages; p++) {
        const res = await fetch(
          `/api/discogs?username=${encodeURIComponent(user)}&token=${encodeURIComponent(tok)}&page=${p}&per_page=100`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Fetch error");
        all.push(...data.releases);
        setProgress({ loaded: all.length, total });
      }

      setReleases(all);
      saveToStorage("discogs_releases", all);
      saveToStorage("discogs_creds", { username: user, token: tok });
      setSavedCreds({ username: user, token: tok });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  // active playlist helper
  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null;

  const toggleRelease = useCallback(
    (releaseId: number) => {
      if (!activePlaylistId) {
        setPlaylistModal(true);
        return;
      }
      setPlaylists((prev) => {
        const updated = prev.map((pl) => {
          if (pl.id !== activePlaylistId) return pl;
          const has = pl.releaseIds.includes(releaseId);
          return {
            ...pl,
            releaseIds: has
              ? pl.releaseIds.filter((id) => id !== releaseId)
              : [...pl.releaseIds, releaseId],
          };
        });
        saveToStorage("discogs_playlists", updated);
        return updated;
      });
    },
    [activePlaylistId]
  );

  const createPlaylist = useCallback(() => {
    const name = newPlaylistName.trim();
    if (!name) return;
    const pl: Playlist = { id: uid(), name, releaseIds: [], createdAt: new Date().toISOString() };
    setPlaylists((prev) => {
      const updated = [...prev, pl];
      saveToStorage("discogs_playlists", updated);
      return updated;
    });
    setActivePlaylistId(pl.id);
    setNewPlaylistName("");
    setPlaylistModal(false);
  }, [newPlaylistName]);

  const deletePlaylist = useCallback((id: string) => {
    setPlaylists((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      saveToStorage("discogs_playlists", updated);
      return updated;
    });
    setActivePlaylistId((cur) => (cur === id ? null : cur));
  }, []);

  const removeFromPlaylist = useCallback(
    (releaseId: number) => {
      if (!activePlaylistId) return;
      setPlaylists((prev) => {
        const updated = prev.map((pl) =>
          pl.id === activePlaylistId
            ? { ...pl, releaseIds: pl.releaseIds.filter((id) => id !== releaseId) }
            : pl
        );
        saveToStorage("discogs_playlists", updated);
        return updated;
      });
    },
    [activePlaylistId]
  );

  // filtered releases for collection view
  const genres = ["All", ...getGenres(releases)];
  const filtered = releases.filter((r) => {
    const genreOk =
      selectedGenre === "All" || r.basic_information.genres.includes(selectedGenre);
    const q = search.toLowerCase();
    const searchOk =
      !q ||
      r.basic_information.title.toLowerCase().includes(q) ||
      r.basic_information.artists.some((a) => a.name.toLowerCase().includes(q));
    return genreOk && searchOk;
  });

  // releases for playlist view
  const playlistReleases = activePlaylist
    ? releases.filter((r) => activePlaylist.releaseIds.includes(r.basic_information.id))
    : [];

  // ── render: login ────────────────────────────────────────────────────────────

  if (!savedCreds && releases.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
          <h1 className="mb-2 text-2xl font-bold">Record Collection</h1>
          <p className="mb-6 text-sm text-zinc-400">
            Connect your Discogs account to browse your collection and create playlists.
          </p>
          {error && (
            <p className="mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</p>
          )}
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">
                Discogs Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your_username"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">
                Personal Access Token
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="••••••••••••••••"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Get your token at{" "}
                <span className="text-amber-400">discogs.com → Settings → Developers</span>
              </p>
            </div>
            <button
              onClick={() => fetchCollection(username, token)}
              disabled={!username || !token || loading}
              className="w-full rounded-lg bg-amber-500 py-2.5 font-semibold text-zinc-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Loading..." : "Load Collection"}
            </button>
          </div>
          {loading && progress.total > 0 && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-zinc-400">
                <span>Loading records...</span>
                <span>
                  {progress.loaded} / {progress.total}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: `${(progress.loaded / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── render: main app ──────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* header */}
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold">Record Collection</span>
          {savedCreds && (
            <span className="hidden text-sm text-zinc-500 sm:inline">@{savedCreds.username}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <span className="text-xs text-zinc-400">
              {progress.loaded}/{progress.total}
            </span>
          )}
          <button
            onClick={() => {
              const u = savedCreds?.username ?? username;
              const t = savedCreds?.token ?? token;
              if (u && t) fetchCollection(u, t);
            }}
            disabled={loading}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-50"
          >
            {loading ? "Syncing…" : "Sync"}
          </button>
          <button
            onClick={() => {
              localStorage.removeItem("discogs_creds");
              localStorage.removeItem("discogs_releases");
              setSavedCreds(null);
              setReleases([]);
            }}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:border-zinc-500"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* nav tabs */}
      <div className="flex shrink-0 gap-1 border-b border-zinc-800 bg-zinc-900 px-4">
        {(["collection", "playlists"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`border-b-2 px-4 py-2 text-sm font-medium capitalize transition-colors ${
              view === v
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {v}
            {v === "collection" && releases.length > 0 && (
              <span className="ml-2 rounded-full bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                {releases.length}
              </span>
            )}
            {v === "playlists" && playlists.length > 0 && (
              <span className="ml-2 rounded-full bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                {playlists.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* body */}
      {view === "collection" ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* genre sidebar */}
          <aside className="hidden w-44 shrink-0 overflow-y-auto border-r border-zinc-800 bg-zinc-900 p-3 sm:block">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Genre
            </p>
            {genres.map((g) => (
              <button
                key={g}
                onClick={() => setSelectedGenre(g)}
                className={`mb-1 w-full rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                  selectedGenre === g
                    ? "bg-amber-500 text-zinc-950 font-semibold"
                    : "text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {g}
              </button>
            ))}
          </aside>

          {/* main content */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* toolbar */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-950 p-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title or artist…"
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none min-w-0"
              />
              {/* mobile genre select */}
              <select
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300 focus:border-amber-500 focus:outline-none sm:hidden"
              >
                {genres.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
              {activePlaylist ? (
                <span className="rounded-lg bg-amber-950 px-3 py-1.5 text-sm text-amber-300">
                  Adding to: <strong>{activePlaylist.name}</strong>
                </span>
              ) : (
                <button
                  onClick={() => setPlaylistModal(true)}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-amber-500 hover:text-amber-300"
                >
                  + New playlist
                </button>
              )}
            </div>

            {/* record list */}
            <div className="flex-1 overflow-y-auto p-4">
              {error && (
                <p className="mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</p>
              )}
              {filtered.length === 0 ? (
                <p className="py-16 text-center text-zinc-500">No records found.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((r) => (
                    <RecordCard
                      key={r.instance_id}
                      release={r}
                      inPlaylist={
                        activePlaylist?.releaseIds.includes(r.basic_information.id) ?? false
                      }
                      onToggle={() => toggleRelease(r.basic_information.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        // ── playlists view ──────────────────────────────────────────────────────
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* playlist list */}
          <aside className="w-52 shrink-0 overflow-y-auto border-r border-zinc-800 bg-zinc-900 p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Playlists
              </p>
              <button
                onClick={() => setPlaylistModal(true)}
                className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
              >
                + New
              </button>
            </div>
            {playlists.length === 0 ? (
              <p className="text-sm text-zinc-500">No playlists yet.</p>
            ) : (
              playlists.map((pl) => (
                <div
                  key={pl.id}
                  className={`group mb-1 flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 transition-colors ${
                    activePlaylistId === pl.id
                      ? "bg-amber-500 text-zinc-950"
                      : "text-zinc-300 hover:bg-zinc-800"
                  }`}
                  onClick={() => setActivePlaylistId(pl.id)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{pl.name}</p>
                    <p
                      className={`text-xs ${
                        activePlaylistId === pl.id ? "text-amber-800" : "text-zinc-500"
                      }`}
                    >
                      {pl.releaseIds.length} records
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePlaylist(pl.id);
                    }}
                    className={`ml-2 shrink-0 rounded p-0.5 text-xs opacity-0 group-hover:opacity-100 ${
                      activePlaylistId === pl.id
                        ? "hover:bg-amber-400 text-amber-900"
                        : "hover:bg-zinc-700 text-zinc-500"
                    }`}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </aside>

          {/* playlist content */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {!activePlaylist ? (
              <div className="flex flex-1 items-center justify-center text-zinc-500">
                Select or create a playlist
              </div>
            ) : (
              <>
                <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-3">
                  <div>
                    <h2 className="text-lg font-bold">{activePlaylist.name}</h2>
                    <p className="text-sm text-zinc-400">
                      {activePlaylist.releaseIds.length} records
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setView("collection");
                    }}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-amber-500 hover:text-amber-300"
                  >
                    + Add records
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {playlistReleases.length === 0 ? (
                    <p className="py-16 text-center text-zinc-500">
                      No records yet.{" "}
                      <button
                        className="text-amber-400 hover:underline"
                        onClick={() => setView("collection")}
                      >
                        Add some from your collection.
                      </button>
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {playlistReleases.map((r) => (
                        <RecordCard
                          key={r.instance_id}
                          release={r}
                          inPlaylist
                          onToggle={() => removeFromPlaylist(r.basic_information.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* new playlist modal */}
      {playlistModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setPlaylistModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-bold">New Playlist</h3>
            <input
              type="text"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createPlaylist()}
              placeholder="Playlist name…"
              autoFocus
              className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={createPlaylist}
                disabled={!newPlaylistName.trim()}
                className="flex-1 rounded-lg bg-amber-500 py-2 font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
              >
                Create
              </button>
              <button
                onClick={() => setPlaylistModal(false)}
                className="flex-1 rounded-lg border border-zinc-700 py-2 text-zinc-300 hover:border-zinc-500"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
