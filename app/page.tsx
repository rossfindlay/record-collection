"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { DiscogsRelease, DiscogsWantlistItem, Playlist } from "@/lib/discogs";
import {
  SpotifyTokens,
  SpotifyTrack,
  SpotifyAlbum,
  SpotifyPlaylist,
  SpotifyPlaylistTracksResponse,
  generateCodeVerifier,
  generateCodeChallenge,
  buildAuthUrl,
  tracksToAlbums,
} from "@/lib/spotify";
import rollingStone500 from "@/lib/rolling-stone-500.json";

// ── Rolling Stone 500 helpers ─────────────────────────────────────────────────

type RS500Entry = { rank: number; artist: string; album: string; year: number };
type RS500Filter = "all" | "owned" | "wanted" | "missing";

function normalizeStr(s: string) {
  return s
    .toLowerCase()
    .replace(/\s*\(\d+\)\s*$/, "") // strip Discogs duplicate suffix like "(2)"
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeArtist(s: string) {
  return normalizeStr(s).replace(/^the /, "");
}

function buildRS500Matches(releases: DiscogsRelease[]): Map<number, DiscogsRelease> {
  const result = new Map<number, DiscogsRelease>();
  for (const entry of rollingStone500 as RS500Entry[]) {
    const normArtist = normalizeArtist(entry.artist);
    const normAlbum = normalizeStr(entry.album);
    const match = releases.find((r) => {
      const info = r.basic_information;
      const artistMatch = info.artists.some((a) => {
        const na = normalizeArtist(a.name);
        return na === normArtist || na.includes(normArtist) || normArtist.includes(na);
      });
      if (!artistMatch) return false;
      const na = normalizeStr(info.title);
      return na === normAlbum || na.includes(normAlbum) || normAlbum.includes(na);
    });
    if (match) result.set(entry.rank, match);
  }
  return result;
}

function buildRS500WantlistMatches(wantlist: DiscogsWantlistItem[]): Map<number, DiscogsWantlistItem> {
  const result = new Map<number, DiscogsWantlistItem>();
  for (const entry of rollingStone500 as RS500Entry[]) {
    const normArtist = normalizeArtist(entry.artist);
    const normAlbum = normalizeStr(entry.album);
    const match = wantlist.find((w) => {
      const info = w.basic_information;
      const artistMatch = info.artists.some((a) => {
        const na = normalizeArtist(a.name);
        return na === normArtist || na.includes(normArtist) || normArtist.includes(na);
      });
      if (!artistMatch) return false;
      const na = normalizeStr(info.title);
      return na === normAlbum || na.includes(normAlbum) || normAlbum.includes(na);
    });
    if (match) result.set(entry.rank, match);
  }
  return result;
}

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
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Silently ignore storage errors (e.g. QuotaExceededError for large datasets)
  }
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

function RS500Row({
  entry,
  match,
  wanted,
  onAddToWantlist,
  isAdding,
  addError,
}: {
  entry: RS500Entry;
  match: DiscogsRelease | undefined;
  wanted: DiscogsWantlistItem | undefined;
  onAddToWantlist?: () => void;
  isAdding?: boolean;
  addError?: string;
}) {
  const thumb = match?.basic_information.thumb ?? wanted?.basic_information.thumb;
  const thumbAlt = entry.album;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
        match
          ? "border-green-800 bg-green-950/30"
          : wanted
          ? "border-blue-800 bg-blue-950/30"
          : "border-zinc-800 bg-zinc-900"
      }`}
    >
      <span className="w-8 shrink-0 text-right font-mono text-sm text-zinc-500">
        {entry.rank}
      </span>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt={thumbAlt}
          className="h-10 w-10 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-zinc-800 text-xl text-zinc-600">
          ♪
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-zinc-100">{entry.album}</p>
        <p className="truncate text-sm text-zinc-400">
          {entry.artist} · {entry.year}
        </p>
        {addError && (
          <p className="truncate text-xs text-red-400" title={addError}>
            {addError}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {match && (
          <span className="rounded-full bg-green-900 px-2 py-0.5 text-xs font-medium text-green-300">
            Owned
          </span>
        )}
        {wanted && (
          <span className="rounded-full bg-blue-900 px-2 py-0.5 text-xs font-medium text-blue-300">
            Wanted
          </span>
        )}
        {!match && !wanted && onAddToWantlist && (
          <button
            onClick={onAddToWantlist}
            disabled={isAdding}
            title="Add all vinyl versions of this album to your Discogs wantlist"
            className="rounded-full border border-blue-700 px-2 py-0.5 text-xs text-blue-400 transition-colors hover:bg-blue-900/40 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAdding ? "Adding…" : "+ Wantlist"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

type View = "collection" | "playlists" | "rs500" | "spotify";
type SpotifyTimeRange = "long_term" | "medium_term" | "short_term";
type SpotifyViewMode = "tracks" | "top" | "playlists";

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
  const [rs500Filter, setRS500Filter] = useState<RS500Filter>("all");

  // wantlist
  const [wantlist, setWantlist] = useState<DiscogsWantlistItem[]>([]);
  const [wantlistLoading, setWantlistLoading] = useState(false);
  const [wantlistProgress, setWantlistProgress] = useState({ loaded: 0, total: 0 });
  const [wantlistError, setWantlistError] = useState("");
  // per-entry add-to-wantlist state (keyed by RS500 rank)
  const [addingRanks, setAddingRanks] = useState<number[]>([]);
  const [addErrors, setAddErrors] = useState<Record<number, string>>({});

  // spotify
  const [spotifyTokens, setSpotifyTokens] = useState<SpotifyTokens | null>(null);
  const [spotifyClientId, setSpotifyClientId] = useState("");
  const [spotifyConnecting, setSpotifyConnecting] = useState(false);
  const [spotifyError, setSpotifyError] = useState("");
  const [spotifyViewMode, setSpotifyViewMode] = useState<SpotifyViewMode>("tracks");
  const [spotifyTimeRange, setSpotifyTimeRange] = useState<SpotifyTimeRange>("long_term");
  const [spotifyTopTracks, setSpotifyTopTracks] = useState<SpotifyTrack[]>([]);
  const [spotifyTopAlbums, setSpotifyTopAlbums] = useState<SpotifyAlbum[]>([]);
  const [spotifyTopLoading, setSpotifyTopLoading] = useState(false);
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [spotifyPlaylistsLoading, setSpotifyPlaylistsLoading] = useState(false);
  const [activeSpotifyPlaylistId, setActiveSpotifyPlaylistId] = useState<string | null>(null);
  const [spotifyPlaylistAlbums, setSpotifyPlaylistAlbums] = useState<SpotifyAlbum[]>([]);
  const [spotifyPlaylistLoading, setSpotifyPlaylistLoading] = useState(false);

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
    setWantlist(loadFromStorage("discogs_wantlist", []));
    setSpotifyTokens(loadFromStorage("spotify_tokens", null));
    setSpotifyClientId(loadFromStorage("spotify_client_id", ""));
    setSpotifyTopTracks(loadFromStorage("spotify_top_tracks", []));
    setSpotifyTopAlbums(loadFromStorage("spotify_top_albums", []));
    setSpotifyPlaylists(loadFromStorage("spotify_playlists", []));
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

  const fetchWantlist = useCallback(async (user: string, tok: string) => {
    setWantlistLoading(true);
    setWantlistError("");
    setWantlistProgress({ loaded: 0, total: 0 });

    // Pace requests to stay within Discogs's 60 req/min rate limit.
    // Each fetch also takes ~300-500ms in flight, so 700ms gap keeps us
    // comfortably under the limit even for very large wantlists.
    const DELAY_MS = 700;
    const MAX_RETRIES = 3;

    async function fetchPage(page: number): Promise<Response> {
      const url = `/api/discogs/wantlist?username=${encodeURIComponent(user)}&token=${encodeURIComponent(tok)}&page=${page}&per_page=100`;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const res = await fetch(url);
        if (res.status === 429) {
          // Back off for progressively longer before retrying
          await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
          continue;
        }
        return res;
      }
      throw new Error("Rate limited by Discogs — please try again in a minute");
    }

    try {
      const firstRes = await fetchPage(1);
      const first = await firstRes.json();
      if (!firstRes.ok) throw new Error(first.error || "Failed to fetch wantlist");

      const all: DiscogsWantlistItem[] = [...first.wants];
      const pages: number = first.pagination.pages;
      const total: number = first.pagination.items;
      setWantlistProgress({ loaded: all.length, total });

      for (let p = 2; p <= pages; p++) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
        const res = await fetchPage(p);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Fetch error");
        all.push(...data.wants);
        setWantlistProgress({ loaded: all.length, total });
      }

      setWantlist(all);
      // Only persist the fields we actually use (matching + thumb display) so
      // large wantlists don't exceed the 5 MB localStorage quota.
      const slim = all.map((w) => ({
        id: w.id,
        basic_information: {
          title: w.basic_information.title,
          thumb: w.basic_information.thumb,
          artists: w.basic_information.artists.map((a) => ({ name: a.name })),
        },
      }));
      saveToStorage("discogs_wantlist", slim);
    } catch (e) {
      setWantlistError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setWantlistLoading(false);
    }
  }, []);

  // ── Spotify helpers ───────────────────────────────────────────────────────────

  /** Get a valid access token, refreshing if expired. */
  const getSpotifyToken = useCallback(async (tokens: SpotifyTokens): Promise<string | null> => {
    if (Date.now() < tokens.expiresAt - 60_000) return tokens.accessToken;
    const storedClientId = loadFromStorage<string>("spotify_client_id", "");
    if (!storedClientId) return null;
    try {
      // Refresh directly from the browser — PKCE is designed for this.
      const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokens.refreshToken,
          client_id: storedClientId,
        }).toString(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error_description || data.error || "Token refresh failed");
      const refreshed: SpotifyTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? tokens.refreshToken,
        expiresAt: Date.now() + data.expires_in * 1000,
      };
      setSpotifyTokens(refreshed);
      saveToStorage("spotify_tokens", refreshed);
      return refreshed.accessToken;
    } catch {
      return null;
    }
  }, []);

  /** Kick off the PKCE authorization flow. */
  const connectSpotify = useCallback(async (clientId: string) => {
    if (!clientId.trim()) return;
    setSpotifyConnecting(true);
    setSpotifyError("");
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = Math.random().toString(36).slice(2);
    const redirectUri = `${window.location.origin}${window.location.pathname}`;
    saveToStorage("spotify_pkce", { verifier, state, clientId: clientId.trim() });
    saveToStorage("spotify_client_id", clientId.trim());
    window.location.href = buildAuthUrl(clientId.trim(), redirectUri, challenge, state);
  }, []);

  /** Handle the redirect back from Spotify with ?code=... */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code) return;

    const pkce = loadFromStorage<{ verifier: string; state: string; clientId: string } | null>(
      "spotify_pkce",
      null
    );
    if (!pkce || pkce.state !== state) return;

    // Clean the URL immediately so a page refresh doesn't re-trigger
    window.history.replaceState({}, "", window.location.pathname);
    localStorage.removeItem("spotify_pkce");

    const redirectUri = `${window.location.origin}${window.location.pathname}`;
    (async () => {
      try {
        // Exchange code for tokens directly — no server proxy needed for PKCE.
        const res = await fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
            client_id: pkce.clientId,
            code_verifier: pkce.verifier,
          }).toString(),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error_description || data.error || "Token exchange failed");
        const tokens: SpotifyTokens = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + data.expires_in * 1000,
        };
        setSpotifyTokens(tokens);
        saveToStorage("spotify_tokens", tokens);
        setView("spotify");
      } catch (e) {
        setSpotifyError(e instanceof Error ? e.message : "Spotify auth failed");
      } finally {
        setSpotifyConnecting(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Fetch top tracks for a given time range and collapse to albums. */
  const fetchSpotifyTop = useCallback(async (tokens: SpotifyTokens, timeRange: SpotifyTimeRange) => {
    setSpotifyTopLoading(true);
    setSpotifyError("");
    try {
      const token = await getSpotifyToken(tokens);
      if (!token) throw new Error("Could not get Spotify access token");

      // Call Spotify directly from the browser — PKCE tokens support CORS.
      const res = await fetch(
        `https://api.spotify.com/v1/me/top/tracks?time_range=${timeRange}&limit=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: { message?: string } })?.error?.message || "Failed to fetch top tracks");

      const tracks = (data.items as SpotifyTrack[]) ?? [];
      const albums = tracksToAlbums(tracks);
      setSpotifyTopTracks(tracks);
      setSpotifyTopAlbums(albums);
      saveToStorage("spotify_top_tracks", tracks);
      saveToStorage("spotify_top_albums", albums);
    } catch (e) {
      setSpotifyError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSpotifyTopLoading(false);
    }
  }, [getSpotifyToken]);

  /** Fetch the user's Spotify playlists. */
  const fetchSpotifyPlaylists = useCallback(async (tokens: SpotifyTokens) => {
    setSpotifyPlaylistsLoading(true);
    setSpotifyError("");
    try {
      const token = await getSpotifyToken(tokens);
      if (!token) throw new Error("Could not get Spotify access token");

      const res = await fetch(
        `https://api.spotify.com/v1/me/playlists?limit=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: { message?: string } })?.error?.message || "Failed to fetch playlists");

      setSpotifyPlaylists(data.items ?? []);
      saveToStorage("spotify_playlists", data.items ?? []);
    } catch (e) {
      setSpotifyError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSpotifyPlaylistsLoading(false);
    }
  }, [getSpotifyToken]);

  /** Fetch all tracks from a playlist and collapse to albums. */
  const fetchSpotifyPlaylistTracks = useCallback(async (tokens: SpotifyTokens, playlistId: string) => {
    setSpotifyPlaylistLoading(true);
    setSpotifyError("");
    try {
      const token = await getSpotifyToken(tokens);
      if (!token) throw new Error("Could not get Spotify access token");

      const allTracks: SpotifyTrack[] = [];
      let offset = 0;
      const limit = 50;
      const MAX_PAGES = 20; // cap at 1,000 tracks to avoid OOM on very large playlists

      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await fetch(
          `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?limit=${limit}&offset=${offset}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data: SpotifyPlaylistTracksResponse = await res.json();
        if (!res.ok) throw new Error(
          (data as unknown as { error?: { message?: string } })?.error?.message || "Failed to fetch playlist tracks"
        );

        for (const item of data.items ?? []) {
          if (item.track) allTracks.push(item.track);
        }
        if (!data.next) break;
        offset += limit;
      }

      setSpotifyPlaylistAlbums(tracksToAlbums(allTracks));
    } catch (e) {
      setSpotifyError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSpotifyPlaylistLoading(false);
    }
  }, [getSpotifyToken]);

  /** Match Spotify albums against the Discogs collection using the same fuzzy logic. */
  const matchSpotifyAlbum = useCallback((album: SpotifyAlbum): DiscogsRelease | undefined => {
    const normAlbum = normalizeStr(album.name);
    return releases.find((r) => {
      const info = r.basic_information;
      const artistMatch = album.artists.some((sa) => {
        const normSA = normalizeArtist(sa.name);
        return info.artists.some((da) => {
          const normDA = normalizeArtist(da.name);
          return normDA === normSA || normDA.includes(normSA) || normSA.includes(normDA);
        });
      });
      if (!artistMatch) return false;
      const na = normalizeStr(info.title);
      return na === normAlbum || na.includes(normAlbum) || normAlbum.includes(na);
    });
  }, [releases]);

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

  const addToWantlist = useCallback(
    async (entry: RS500Entry) => {
      const u = savedCreds?.username ?? username;
      const t = savedCreds?.token ?? token;
      if (!u || !t) return;

      setAddingRanks((prev) => [...prev, entry.rank]);
      setAddErrors((prev) => {
        const next = { ...prev };
        delete next[entry.rank];
        return next;
      });

      try {
        const res = await fetch("/api/discogs/add-to-wantlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: u, token: t, artist: entry.artist, title: entry.album }),
        });
        const data = await res.json() as {
          error?: string;
          vinylVersions?: number;
          added?: number;
          releaseIds?: number[];
        };

        if (!res.ok) {
          setAddErrors((prev) => ({ ...prev, [entry.rank]: data.error ?? "Failed to add to wantlist" }));
          return;
        }

        // Optimistically update local wantlist so the "Wanted" badge appears
        // immediately without needing a full wantlist refresh.
        const fakeItem: DiscogsWantlistItem = {
          id: data.releaseIds?.[0] ?? Date.now(),
          date_added: new Date().toISOString(),
          basic_information: {
            id: data.releaseIds?.[0] ?? Date.now(),
            title: entry.album,
            year: entry.year,
            thumb: "",
            cover_image: "",
            artists: [{ name: entry.artist, id: 0 }],
            labels: [],
            formats: [{ name: "Vinyl" }],
            genres: [],
            styles: [],
          },
        };

        setWantlist((prev) => {
          const updated = [...prev, fakeItem];
          const slim = updated.map((w) => ({
            id: w.id,
            basic_information: {
              title: w.basic_information.title,
              thumb: w.basic_information.thumb,
              artists: w.basic_information.artists.map((a) => ({ name: a.name })),
            },
          }));
          saveToStorage("discogs_wantlist", slim);
          return updated;
        });
      } catch (e) {
        setAddErrors((prev) => ({
          ...prev,
          [entry.rank]: e instanceof Error ? e.message : "Unknown error",
        }));
      } finally {
        setAddingRanks((prev) => prev.filter((r) => r !== entry.rank));
      }
    },
    [savedCreds, username, token]
  );

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

  // Rolling Stone 500 matching
  const rs500Matches = useMemo(() => buildRS500Matches(releases), [releases]);
  const rs500WantlistMatches = useMemo(() => buildRS500WantlistMatches(wantlist), [wantlist]);
  const rs500Entries = rollingStone500 as RS500Entry[];
  const rs500Filtered = rs500Entries.filter((e) => {
    if (rs500Filter === "owned") return rs500Matches.has(e.rank);
    if (rs500Filter === "wanted") return rs500WantlistMatches.has(e.rank) && !rs500Matches.has(e.rank);
    if (rs500Filter === "missing") return !rs500Matches.has(e.rank) && !rs500WantlistMatches.has(e.rank);
    return true;
  });

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
              localStorage.removeItem("discogs_wantlist");
              setSavedCreds(null);
              setReleases([]);
              setWantlist([]);
            }}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:border-zinc-500"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* nav tabs */}
      <div className="flex shrink-0 gap-1 border-b border-zinc-800 bg-zinc-900 px-4">
        {(["collection", "playlists", "rs500", "spotify"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              view === v
                ? v === "spotify"
                  ? "border-green-500 text-green-400"
                  : "border-amber-500 text-amber-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {v === "rs500" ? "RS 500" : v.charAt(0).toUpperCase() + v.slice(1)}
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
            {v === "rs500" && rs500Matches.size > 0 && (
              <span className="ml-2 rounded-full bg-green-900 px-1.5 py-0.5 text-xs text-green-300">
                {rs500Matches.size}
              </span>
            )}
            {v === "spotify" && spotifyTokens && (
              <span className="ml-2 rounded-full bg-green-900 px-1.5 py-0.5 text-xs text-green-300">
                ✓
              </span>
            )}
          </button>
        ))}
      </div>

      {/* body */}
      {view === "collection" && (
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
      )}
      {view === "playlists" && (
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

      {/* rs500 view */}
      {view === "rs500" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* summary bar */}
          <div className="shrink-0 border-b border-zinc-800 bg-zinc-950 px-4 py-3">
            {/* title row */}
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <span className="text-lg font-bold text-zinc-100">
                    {rs500Matches.size}
                    <span className="text-zinc-400 font-normal"> / 500</span>
                  </span>
                  <span className="ml-2 text-sm text-zinc-400">Rolling Stone Greatest Albums</span>
                </div>
                {savedCreds && (
                  <a
                    href={`https://www.discogs.com/${encodeURIComponent(savedCreds.username)}/wants`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-zinc-700 px-3 py-1 text-sm text-zinc-400 transition-colors hover:border-blue-600 hover:text-blue-400"
                  >
                    View Wantlist ↗
                  </a>
                )}
              </div>
              <span className="text-sm text-zinc-500">
                {Math.round((rs500Matches.size / 500) * 100)}%
              </span>
            </div>
            {/* owned progress bar */}
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-green-600 transition-all"
                style={{ width: `${(rs500Matches.size / 500) * 100}%` }}
              />
            </div>
            {/* wantlist row */}
            <div className="mt-2 flex items-center gap-3">
              {wantlist.length > 0 ? (
                <>
                  <div className="flex-1">
                    <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                      <span>{rs500WantlistMatches.size} / 500 on wantlist</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full bg-blue-600 transition-all"
                        style={{ width: `${(rs500WantlistMatches.size / 500) * 100}%` }}
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const u = savedCreds?.username ?? username;
                      const t = savedCreds?.token ?? token;
                      if (u && t) fetchWantlist(u, t);
                    }}
                    disabled={wantlistLoading}
                    className="shrink-0 rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
                  >
                    {wantlistLoading
                      ? `${wantlistProgress.loaded.toLocaleString()} / ${wantlistProgress.total.toLocaleString()}`
                      : "Refresh Wantlist"}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    const u = savedCreds?.username ?? username;
                    const t = savedCreds?.token ?? token;
                    if (u && t) fetchWantlist(u, t);
                  }}
                  disabled={wantlistLoading}
                  className="rounded-lg border border-zinc-700 px-3 py-1 text-sm text-zinc-400 hover:border-blue-600 hover:text-blue-400 disabled:opacity-50"
                >
                  {wantlistLoading
                    ? `Loading wantlist… ${wantlistProgress.loaded.toLocaleString()}${wantlistProgress.total ? ` / ${wantlistProgress.total.toLocaleString()}` : ""}`
                    : "Load Wantlist"}
                </button>
              )}
            </div>
            {wantlistError && (
              <p className="mt-2 text-xs text-red-400">{wantlistError}</p>
            )}
            {/* filter buttons */}
            <div className="mt-3 flex flex-wrap gap-2">
              {(["all", "owned", "wanted", "missing"] as RS500Filter[]).map((f) => {
                const count =
                  f === "all"
                    ? 500
                    : f === "owned"
                    ? rs500Matches.size
                    : f === "wanted"
                    ? rs500WantlistMatches.size - [...rs500WantlistMatches.keys()].filter((k) => rs500Matches.has(k)).length
                    : 500 - rs500Matches.size - (rs500WantlistMatches.size - [...rs500WantlistMatches.keys()].filter((k) => rs500Matches.has(k)).length);
                return (
                  <button
                    key={f}
                    onClick={() => setRS500Filter(f)}
                    className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${
                      rs500Filter === f
                        ? f === "wanted"
                          ? "bg-blue-600 text-white"
                          : "bg-amber-500 text-zinc-950"
                        : "border border-zinc-700 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                    <span className="ml-1.5 text-xs opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {/* list */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {rs500Filtered.map((entry) => (
                <RS500Row
                  key={entry.rank}
                  entry={entry}
                  match={rs500Matches.get(entry.rank)}
                  wanted={rs500WantlistMatches.get(entry.rank)}
                  onAddToWantlist={savedCreds ? () => addToWantlist(entry) : undefined}
                  isAdding={addingRanks.includes(entry.rank)}
                  addError={addErrors[entry.rank]}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── spotify view ─────────────────────────────────────────────────────── */}
      {view === "spotify" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!spotifyTokens ? (
            /* ── connect screen ── */
            <div className="flex flex-1 items-center justify-center px-4">
              <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-2xl font-bold">Connect Spotify</span>
                </div>
                <p className="mb-6 text-sm text-zinc-400">
                  See which albums from your Spotify listening you own on vinyl.
                  You need a free Spotify app Client ID — create one at{" "}
                  <span className="text-green-400">developer.spotify.com/dashboard</span>
                  {" "}(add <span className="font-mono text-xs text-zinc-300">{typeof window !== "undefined" ? window.location.origin + window.location.pathname : ""}</span> as a Redirect URI).
                </p>
                {spotifyError && (
                  <p className="mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">{spotifyError}</p>
                )}
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-300">
                      Spotify Client ID
                    </label>
                    <input
                      type="text"
                      value={spotifyClientId}
                      onChange={(e) => setSpotifyClientId(e.target.value)}
                      placeholder="e.g. 4b3f…"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-500 focus:border-green-500 focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => connectSpotify(spotifyClientId)}
                    disabled={!spotifyClientId.trim() || spotifyConnecting}
                    className="w-full rounded-lg bg-green-600 py-2.5 font-semibold text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {spotifyConnecting ? "Connecting…" : "Connect with Spotify"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ── connected: top / playlists ── */
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* toolbar */}
              <div className="shrink-0 border-b border-zinc-800 bg-zinc-950 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  {/* mode toggle */}
                  <div className="flex rounded-lg border border-zinc-700 p-0.5">
                    {([
                      ["tracks", "Top Tracks"],
                      ["top", "Top Albums"],
                      ["playlists", "Playlists"],
                    ] as [SpotifyViewMode, string][]).map(([m, label]) => (
                      <button
                        key={m}
                        onClick={() => setSpotifyViewMode(m)}
                        className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                          spotifyViewMode === m
                            ? "bg-green-600 text-white"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* time range (tracks or albums mode) */}
                  {(spotifyViewMode === "tracks" || spotifyViewMode === "top") && (
                    <div className="flex rounded-lg border border-zinc-700 p-0.5">
                      {([
                        ["long_term", "All time"],
                        ["medium_term", "6 months"],
                        ["short_term", "4 weeks"],
                      ] as [SpotifyTimeRange, string][]).map(([range, label]) => (
                        <button
                          key={range}
                          onClick={() => {
                            setSpotifyTimeRange(range);
                            fetchSpotifyTop(spotifyTokens, range);
                          }}
                          className={`rounded-md px-3 py-1 text-sm transition-colors ${
                            spotifyTimeRange === range
                              ? "bg-zinc-700 text-zinc-100"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* refresh buttons */}
                  {(spotifyViewMode === "tracks" || spotifyViewMode === "top") && (
                    <button
                      onClick={() => fetchSpotifyTop(spotifyTokens, spotifyTimeRange)}
                      disabled={spotifyTopLoading}
                      className="ml-auto rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
                    >
                      {spotifyTopLoading ? "Loading…" : spotifyTopTracks.length ? "Refresh" : "Load Top Tracks"}
                    </button>
                  )}
                  {spotifyViewMode === "playlists" && (
                    <button
                      onClick={() => fetchSpotifyPlaylists(spotifyTokens)}
                      disabled={spotifyPlaylistsLoading}
                      className="ml-auto rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
                    >
                      {spotifyPlaylistsLoading ? "Loading…" : spotifyPlaylists.length ? "Refresh" : "Load Playlists"}
                    </button>
                  )}

                  {/* disconnect */}
                  <button
                    onClick={() => {
                      localStorage.removeItem("spotify_tokens");
                      localStorage.removeItem("spotify_top_tracks");
                      localStorage.removeItem("spotify_top_albums");
                      localStorage.removeItem("spotify_playlists");
                      localStorage.removeItem("spotify_client_id");
                      setSpotifyTokens(null);
                      setSpotifyTopTracks([]);
                      setSpotifyTopAlbums([]);
                      setSpotifyPlaylists([]);
                      setSpotifyClientId("");
                    }}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:border-zinc-500"
                  >
                    Disconnect
                  </button>
                </div>
                {spotifyError && (
                  <p className="mt-2 text-xs text-red-400">{spotifyError}</p>
                )}
              </div>

              {/* ── top tracks list ── */}
              {spotifyViewMode === "tracks" && (
                <div className="flex-1 overflow-y-auto p-4">
                  {spotifyTopTracks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
                      <p className="mb-3">Load your top tracks to see which ones you own on vinyl.</p>
                      <button
                        onClick={() => fetchSpotifyTop(spotifyTokens, spotifyTimeRange)}
                        disabled={spotifyTopLoading}
                        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
                      >
                        {spotifyTopLoading ? "Loading…" : "Load Top Tracks"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {spotifyTopTracks.map((track, i) => {
                        const discogsMatch = matchSpotifyAlbum({
                          id: track.album.id,
                          name: track.album.name,
                          artists: track.album.artists,
                          image: track.album.images?.[0]?.url ?? "",
                          releaseYear: parseInt(track.album.release_date?.slice(0, 4) ?? "0", 10),
                          trackCount: 1,
                        });
                        const artistStr = track.artists.map((a) => a.name).join(", ");
                        return (
                          <div
                            key={track.id}
                            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                              discogsMatch
                                ? "border-green-800 bg-green-950/30"
                                : "border-zinc-800 bg-zinc-900"
                            }`}
                          >
                            <span className="w-6 shrink-0 text-right font-mono text-xs text-zinc-600">
                              {i + 1}
                            </span>
                            {track.album.images?.[0]?.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={track.album.images[0].url}
                                alt={track.album.name}
                                className="h-10 w-10 shrink-0 rounded object-cover"
                              />
                            ) : (
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-zinc-800 text-xl text-zinc-600">
                                ♪
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold text-zinc-100">{track.name}</p>
                              <p className="truncate text-sm text-zinc-400">
                                {artistStr}
                                <span className="text-zinc-600"> · {track.album.name}</span>
                              </p>
                            </div>
                            {discogsMatch && (
                              <span className="shrink-0 rounded-full bg-green-900 px-2 py-0.5 text-xs font-medium text-green-300">
                                Owned
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── top albums view ── */}
              {spotifyViewMode === "top" && (
                <div className="flex-1 overflow-y-auto p-4">
                  {spotifyTopAlbums.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
                      <p className="mb-3">Load your top tracks to see which albums you own on vinyl.</p>
                      <button
                        onClick={() => fetchSpotifyTop(spotifyTokens, spotifyTimeRange)}
                        disabled={spotifyTopLoading}
                        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
                      >
                        {spotifyTopLoading ? "Loading…" : "Load Top Tracks"}
                      </button>
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {spotifyTopAlbums.map((album) => {
                        const discogsMatch = matchSpotifyAlbum(album);
                        const artistStr = album.artists.map((a) => a.name).join(", ");
                        return (
                          <div
                            key={album.id}
                            className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                              discogsMatch
                                ? "border-green-800 bg-green-950/30"
                                : "border-zinc-800 bg-zinc-900"
                            }`}
                          >
                            {album.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={album.image}
                                alt={album.name}
                                className="h-12 w-12 shrink-0 rounded object-cover"
                              />
                            ) : (
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-zinc-800 text-xl text-zinc-600">
                                ♪
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold text-zinc-100">{album.name}</p>
                              <p className="truncate text-sm text-zinc-400">{artistStr}</p>
                              <p className="text-xs text-zinc-600">
                                {album.trackCount} top track{album.trackCount !== 1 ? "s" : ""}
                                {album.releaseYear ? ` · ${album.releaseYear}` : ""}
                              </p>
                            </div>
                            {discogsMatch ? (
                              <span className="shrink-0 rounded-full bg-green-900 px-2 py-0.5 text-xs font-medium text-green-300">
                                Owned
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">
                                Not owned
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── playlists view ── */}
              {spotifyViewMode === "playlists" && (
                <div className="flex min-h-0 flex-1 overflow-hidden">
                  {/* sidebar */}
                  <aside className="w-56 shrink-0 overflow-y-auto border-r border-zinc-800 bg-zinc-900 p-3">
                    {spotifyPlaylists.length === 0 ? (
                      <p className="text-sm text-zinc-500">
                        {spotifyPlaylistsLoading ? "Loading…" : "No playlists loaded yet."}
                      </p>
                    ) : (
                      spotifyPlaylists.map((pl) => (
                        <button
                          key={pl.id}
                          onClick={() => {
                            setActiveSpotifyPlaylistId(pl.id);
                            fetchSpotifyPlaylistTracks(spotifyTokens, pl.id);
                          }}
                          className={`mb-1 w-full rounded-lg px-3 py-2 text-left transition-colors ${
                            activeSpotifyPlaylistId === pl.id
                              ? "bg-green-700 text-white"
                              : "text-zinc-300 hover:bg-zinc-800"
                          }`}
                        >
                          <p className="truncate text-sm font-medium">{pl.name}</p>
                          <p className={`text-xs ${activeSpotifyPlaylistId === pl.id ? "text-green-200" : "text-zinc-500"}`}>
                            {pl.tracks?.total ?? "?"} tracks
                          </p>
                        </button>
                      ))
                    )}
                  </aside>

                  {/* playlist album grid */}
                  <div className="flex-1 overflow-y-auto p-4">
                    {!activeSpotifyPlaylistId ? (
                      <p className="py-16 text-center text-zinc-500">Select a playlist to see which albums you own.</p>
                    ) : spotifyPlaylistLoading ? (
                      <p className="py-16 text-center text-zinc-500">Loading tracks…</p>
                    ) : spotifyPlaylistAlbums.length === 0 ? (
                      <p className="py-16 text-center text-zinc-500">No tracks found in this playlist.</p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {spotifyPlaylistAlbums.map((album) => {
                          const discogsMatch = matchSpotifyAlbum(album);
                          const artistStr = album.artists.map((a) => a.name).join(", ");
                          return (
                            <div
                              key={album.id}
                              className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                                discogsMatch
                                  ? "border-green-800 bg-green-950/30"
                                  : "border-zinc-800 bg-zinc-900"
                              }`}
                            >
                              {album.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={album.image}
                                  alt={album.name}
                                  className="h-12 w-12 shrink-0 rounded object-cover"
                                />
                              ) : (
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-zinc-800 text-xl text-zinc-600">
                                  ♪
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold text-zinc-100">{album.name}</p>
                                <p className="truncate text-sm text-zinc-400">{artistStr}</p>
                                <p className="text-xs text-zinc-600">
                                  {album.trackCount} track{album.trackCount !== 1 ? "s" : ""}
                                  {album.releaseYear ? ` · ${album.releaseYear}` : ""}
                                </p>
                              </div>
                              {discogsMatch ? (
                                <span className="shrink-0 rounded-full bg-green-900 px-2 py-0.5 text-xs font-medium text-green-300">
                                  Owned
                                </span>
                              ) : (
                                <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">
                                  Not owned
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
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
