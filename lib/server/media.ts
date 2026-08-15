type PinImageCandidate = {
  url: string;
  width: number | null;
  height: number | null;
  rankHint: number;
};

export type PinImageSources = {
  imageUrl: string | null;
  previewImageUrl: string | null;
};

export type PinVideoSource = {
  videoUrl: string;
  mediaType: string;
};

export type PinVideoDiscovery = {
  source: PinVideoSource | null;
  failureReason: string | null;
};

const SIZE_HINTS = new Map<string, number>([
  ["originals", 4000],
  ["orig", 4000],
  ["1200x", 1200],
  ["736x", 736],
  ["600x", 600],
  ["564x", 564],
  ["474x", 474],
  ["236x", 236],
]);

export function getPinImageUrl(
  mediaJson: string | null | undefined,
  fallbackRawJson: string | null | undefined,
) {
  return getPinImageSources(mediaJson, fallbackRawJson).imageUrl;
}

export function getPinImageSources(
  mediaJson: string | null | undefined,
  fallbackRawJson: string | null | undefined,
): PinImageSources {
  const mediaCandidates = findImageCandidates(mediaJson);
  if (mediaCandidates.length > 0) {
    return resolveImageSources(mediaCandidates);
  }

  return resolveImageSources(findImageCandidates(fallbackRawJson));
}

/** Finds a direct video asset supplied by Pinterest. HLS playlists are
 * intentionally excluded because Gemini's URL input requires a video file. */
export function getPinVideoSource(
  mediaJson: string | null | undefined,
  fallbackRawJson: string | null | undefined,
): PinVideoSource | null {
  return getPinVideoDiscovery(mediaJson, fallbackRawJson).source;
}

export function getPinVideoDiscovery(
  mediaJson: string | null | undefined,
  fallbackRawJson: string | null | undefined,
): PinVideoDiscovery {
  const candidate = findVideoCandidate(mediaJson) ?? findVideoCandidate(fallbackRawJson);
  if (!candidate) return { source: null, failureReason: null };
  if (!isDirectVideoUrl(candidate.url)) {
    return { source: null, failureReason: "The pin video is a stream, not a direct video file." };
  }
  return { source: { videoUrl: candidate.url, mediaType: inferVideoMediaType(candidate.url, candidate.record) }, failureReason: null };
}

function findVideoCandidate(value: string | null | undefined): { url: string; record: Record<string, unknown> } | null {
  if (!value) return null;

  try {
    return crawlForVideoCandidate(JSON.parse(value));
  } catch {
    return null;
  }
}

function crawlForVideoCandidate(value: unknown, seen = new Set<unknown>()): { url: string; record: Record<string, unknown> } | null {
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = crawlForVideoCandidate(entry, seen);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const url = [record.url, record.video_url, record.videoUrl].find(
    (candidate): candidate is string => typeof candidate === "string" && isVideoUrlCandidate(candidate),
  );
  if (url) {
    return { url, record };
  }

  for (const key of preferredVideoObjectKeys(record)) {
    const found = crawlForVideoCandidate(record[key], seen);
    if (found) return found;
  }
  return null;
}

function preferredVideoObjectKeys(record: Record<string, unknown>) {
  const keys = Object.keys(record);
  const preferred = ["videos", "video_list", "video", "media", "url", "video_url", "videoUrl"];
  return [...preferred.filter((key) => key in record), ...keys.filter((key) => !preferred.includes(key))];
}

function isDirectVideoUrl(value: string) {
  if (!isVideoUrlCandidate(value) || /\.m3u8(?:\?|$)/i.test(value)) return false;
  return /\.(mp4|mpeg|mpg|mov|avi|webm|wmv|3gp)(?:\?|$)/i.test(value) || /video/i.test(value);
}

function isVideoUrlCandidate(value: string) {
  return /^https:\/\//i.test(value) && (/\.(mp4|mpeg|mpg|mov|avi|webm|wmv|3gp|m3u8)(?:\?|$)/i.test(value) || /video/i.test(value));
}

function inferVideoMediaType(url: string, record: Record<string, unknown>) {
  if (typeof record.media_type === "string" && record.media_type.startsWith("video/")) return record.media_type;
  if (typeof record.mime_type === "string" && record.mime_type.startsWith("video/")) return record.mime_type;
  const extension = url.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1]?.toLowerCase();
  return ({ mp4: "video/mp4", mpeg: "video/mpeg", mpg: "video/mpeg", mov: "video/quicktime", avi: "video/avi", webm: "video/webm", wmv: "video/wmv", "3gp": "video/3gpp" } as Record<string, string>)[extension ?? ""] ?? "video/mp4";
}

function findImageCandidates(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return crawlForImageCandidates(parsed);
  } catch {
    return [];
  }
}

function crawlForImageCandidates(
  value: unknown,
  hints: string[] = [],
  seen = new Map<string, PinImageCandidate>(),
) {
  if (!value) {
    return [...seen.values()];
  }

  if (typeof value === "string") {
    if (isImageUrl(value)) {
      mergeCandidate(seen, {
        url: value,
        width: inferDimensionFromHints(hints),
        height: inferDimensionFromHints(hints),
        rankHint: inferRankHint(hints),
      });
    }
    return [...seen.values()];
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      crawlForImageCandidates(entry, hints, seen);
    }
    return [...seen.values()];
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const width = readNumber(record.width);
    const height = readNumber(record.height);
    const url = readImageUrl(record);

    if (url) {
      mergeCandidate(seen, {
        url,
        width,
        height,
        rankHint: inferRankHint(hints),
      });
    }

    for (const key of preferredObjectKeys(record)) {
      crawlForImageCandidates(record[key], [...hints, key], seen);
    }
  }

  return [...seen.values()];
}

function resolveImageSources(candidates: PinImageCandidate[]): PinImageSources {
  if (candidates.length === 0) {
    return {
      imageUrl: null,
      previewImageUrl: null,
    };
  }

  const ranked = [...candidates].sort(compareCandidatesDescending);
  const imageUrl = ranked[0]?.url ?? null;
  const previewCandidate = [...candidates]
    .filter((candidate) => candidate.url !== imageUrl)
    .sort(compareCandidatesAscending)[0];

  return {
    imageUrl,
    previewImageUrl: previewCandidate?.url ?? null,
  };
}

function compareCandidatesDescending(
  left: PinImageCandidate,
  right: PinImageCandidate,
) {
  return scoreCandidate(right) - scoreCandidate(left);
}

function compareCandidatesAscending(
  left: PinImageCandidate,
  right: PinImageCandidate,
) {
  return scoreCandidate(left) - scoreCandidate(right);
}

function scoreCandidate(candidate: PinImageCandidate) {
  const explicitSize = Math.max(candidate.width ?? 0, candidate.height ?? 0);
  return explicitSize || candidate.rankHint;
}

function mergeCandidate(
  seen: Map<string, PinImageCandidate>,
  candidate: PinImageCandidate,
) {
  const existing = seen.get(candidate.url);
  if (!existing) {
    seen.set(candidate.url, candidate);
    return;
  }

  seen.set(candidate.url, {
    url: candidate.url,
    width: Math.max(existing.width ?? 0, candidate.width ?? 0) || null,
    height: Math.max(existing.height ?? 0, candidate.height ?? 0) || null,
    rankHint: Math.max(existing.rankHint, candidate.rankHint),
  });
}

function preferredObjectKeys(record: Record<string, unknown>) {
  const keys = Object.keys(record);
  const preferred = [
    "url",
    "image_url",
    "images",
    "originals",
    "orig",
    "1200x",
    "736x",
    "600x",
    "564x",
    "474x",
    "236x",
  ];

  return [
    ...preferred.filter((key) => key in record),
    ...keys.filter((key) => !preferred.includes(key)),
  ];
}

function readImageUrl(record: Record<string, unknown>) {
  const directKeys = ["url", "image_url"];

  for (const key of directKeys) {
    const value = record[key];
    if (typeof value === "string" && isImageUrl(value)) {
      return value;
    }
  }

  return null;
}

function inferRankHint(hints: string[]) {
  for (const hint of [...hints].reverse()) {
    const normalized = hint.toLowerCase();
    const explicit = SIZE_HINTS.get(normalized);
    if (explicit) {
      return explicit;
    }

    const parsed = parseSizeHint(normalized);
    if (parsed) {
      return parsed;
    }
  }

  return 0;
}

function inferDimensionFromHints(hints: string[]) {
  for (const hint of [...hints].reverse()) {
    const parsed = parseSizeHint(hint);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function parseSizeHint(value: string) {
  const match = value.match(/(\d{2,4})\s*x\s*(\d{2,4})/i);
  if (!match) {
    return null;
  }

  return Math.max(Number(match[1]), Number(match[2]));
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isImageUrl(value: string) {
  return /^https?:\/\//.test(value)
    && /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(value);
}
