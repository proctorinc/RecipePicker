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
