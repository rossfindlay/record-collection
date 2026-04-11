// ── Spotify OAuth PKCE helpers ────────────────────────────────────────────────

const SPOTIFY_SCOPES = [
  "user-top-read",
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

/** Generate a cryptographically random code verifier for PKCE. */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Derive the PKCE code challenge (S256) from a verifier. */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Build the Spotify authorization URL. */
export function buildAuthUrl(clientId: string, redirectUri: string, codeChallenge: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    state,
  });
  return `https://accounts.spotify.com/authorize?${params}`;
}

// ── Spotify data types ────────────────────────────────────────────────────────

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms since epoch
}

export interface SpotifyArtistSimple {
  id: string;
  name: string;
}

export interface SpotifyAlbumSimple {
  id: string;
  name: string;
  artists: SpotifyArtistSimple[];
  images: Array<{ url: string; width: number; height: number }>;
  release_date: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: SpotifyArtistSimple[];
  album: SpotifyAlbumSimple;
  popularity: number;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  genres: string[];
  images: Array<{ url: string; width: number; height: number }>;
  popularity: number;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  images: Array<{ url: string }>;
  tracks: { total: number };
  owner: { display_name: string };
}

export interface SpotifyTopTracksResponse {
  items: SpotifyTrack[];
}

export interface SpotifyPlaylistsResponse {
  items: SpotifyPlaylist[];
  total: number;
  next: string | null;
}

export interface SpotifyPlaylistTracksResponse {
  items: Array<{ track: SpotifyTrack | null }>;
  total: number;
  next: string | null;
  offset: number;
  limit: number;
}

// ── Album deduplication ───────────────────────────────────────────────────────

export interface SpotifyAlbum {
  id: string;
  name: string;
  artists: SpotifyArtistSimple[];
  image: string;
  releaseYear: number;
  /** How many of the user's top/playlist tracks are from this album */
  trackCount: number;
}

/** Collapse a list of tracks into unique albums, sorted by track frequency. */
export function tracksToAlbums(tracks: SpotifyTrack[]): SpotifyAlbum[] {
  const map = new Map<string, SpotifyAlbum>();
  for (const track of tracks) {
    if (!track?.album) continue;
    const { id, name, artists, images, release_date } = track.album;
    if (map.has(id)) {
      map.get(id)!.trackCount++;
    } else {
      map.set(id, {
        id,
        name,
        artists,
        image: images?.[0]?.url ?? "",
        releaseYear: parseInt(release_date?.slice(0, 4) ?? "0", 10),
        trackCount: 1,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.trackCount - a.trackCount);
}
