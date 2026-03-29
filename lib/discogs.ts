export interface DiscogsRelease {
  id: number;
  instance_id: number;
  date_added: string;
  basic_information: {
    id: number;
    title: string;
    year: number;
    thumb: string;
    cover_image: string;
    artists: Array<{ name: string; id: number }>;
    labels: Array<{ name: string; catno: string }>;
    formats: Array<{ name: string; descriptions?: string[] }>;
    genres: string[];
    styles: string[];
  };
}

export interface CollectionResponse {
  releases: DiscogsRelease[];
  pagination: {
    page: number;
    pages: number;
    per_page: number;
    items: number;
  };
}

export interface Playlist {
  id: string;
  name: string;
  releaseIds: number[];
  createdAt: string;
}

export async function fetchCollection(
  username: string,
  token: string,
  page = 1,
  perPage = 100
): Promise<CollectionResponse> {
  const url = `https://api.discogs.com/users/${encodeURIComponent(username)}/collection/folders/0/releases?page=${page}&per_page=${perPage}&sort=artist&sort_order=asc`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Discogs token=${token}`,
      "User-Agent": "RecordCollectionApp/1.0",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discogs API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function fetchAllReleases(
  username: string,
  token: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<DiscogsRelease[]> {
  const first = await fetchCollection(username, token, 1, 100);
  const releases = [...first.releases];
  onProgress?.(releases.length, first.pagination.items);

  const pages = first.pagination.pages;
  for (let p = 2; p <= pages; p++) {
    const data = await fetchCollection(username, token, p, 100);
    releases.push(...data.releases);
    onProgress?.(releases.length, first.pagination.items);
  }
  return releases;
}

export function getGenres(releases: DiscogsRelease[]): string[] {
  const set = new Set<string>();
  for (const r of releases) {
    for (const g of r.basic_information.genres) set.add(g);
  }
  return Array.from(set).sort();
}

export function filterByGenre(
  releases: DiscogsRelease[],
  genre: string
): DiscogsRelease[] {
  return releases.filter((r) => r.basic_information.genres.includes(genre));
}
