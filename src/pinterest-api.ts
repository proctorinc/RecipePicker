import { loadAppEnvironment } from "@/src/env";

loadAppEnvironment();

const DEFAULT_PAGE_SIZE = 250;

export type PinterestBoard = {
  id: string;
  name?: string | null;
  description?: string | null;
  privacy?: string | null;
  owner?: unknown;
  created_at?: string | null;
  [key: string]: unknown;
};

export type PinterestPin = {
  id: string;
  board_id?: string | null;
  board_section_id?: string | null;
  board_section?: { id?: string | null; name?: string | null } | null;
  board_section_name?: string | null;
  board_section_title?: string | null;
  section_name?: string | null;
  title?: string | null;
  description?: string | null;
  link?: string | null;
  alt_text?: string | null;
  dominant_color?: string | null;
  note?: string | null;
  created_at?: string | null;
  media?: unknown;
  media_source?: unknown;
  parent_pin_id?: string | null;
  creator?: unknown;
  board_owner?: unknown;
  [key: string]: unknown;
};

type PinterestPage<T> = {
  items?: T[];
  bookmark?: string | null;
  code?: number;
  message?: string;
};

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getApiBaseUrl(): string {
  return process.env.PINTEREST_API_BASE_URL?.trim() || "https://api.pinterest.com/v5";
}

async function fetchPage<T>(pathname: string, accessToken: string, bookmark?: string): Promise<PinterestPage<T>> {
  const url = new URL(`${getApiBaseUrl().replace(/\/$/, "")}${pathname}`);
  url.searchParams.set("page_size", String(DEFAULT_PAGE_SIZE));

  if (bookmark) {
    url.searchParams.set("bookmark", bookmark);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Pinterest API request failed (${response.status} ${response.statusText}): ${body}`);
  }

  return (await response.json()) as PinterestPage<T>;
}

export async function fetchAllBoards(accessToken: string): Promise<PinterestBoard[]> {
  const boards: PinterestBoard[] = [];
  let bookmark: string | null | undefined = undefined;

  do {
    const page: PinterestPage<PinterestBoard> = await fetchPage<PinterestBoard>(
      "/boards",
      accessToken,
      bookmark ?? undefined,
    );
    boards.push(...(page.items ?? []));
    bookmark = page.bookmark ?? null;
  } while (bookmark);

  return boards;
}

export async function fetchAllPins(boardId: string, accessToken: string): Promise<PinterestPin[]> {
  const pins: PinterestPin[] = [];
  let bookmark: string | null | undefined = undefined;

  do {
    const page: PinterestPage<PinterestPin> = await fetchPage<PinterestPin>(
      `/boards/${encodeURIComponent(boardId)}/pins`,
      accessToken,
      bookmark ?? undefined,
    );
    pins.push(...(page.items ?? []));
    bookmark = page.bookmark ?? null;
  } while (bookmark);

  return pins;
}
