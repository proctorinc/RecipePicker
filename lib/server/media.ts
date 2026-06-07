export function getPinImageUrl(mediaJson: string | null | undefined, fallbackRawJson: string | null | undefined) {
  const direct = findImageUrl(mediaJson);
  if (direct) {
    return direct;
  }

  return findImageUrl(fallbackRawJson);
}

function findImageUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return crawlForImage(parsed);
  } catch {
    return null;
  }
}

function crawlForImage(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string" && /^https?:\/\//.test(value) && /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const match = crawlForImage(entry);
      if (match) {
        return match;
      }
    }
    return null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferredKeys = ["url", "image_url", "images", "originals", "orig", "600x", "1200x", "564x", "236x"];

    for (const key of preferredKeys) {
      if (key in record) {
        const match = crawlForImage(record[key]);
        if (match) {
          return match;
        }
      }
    }

    for (const nestedValue of Object.values(record)) {
      const match = crawlForImage(nestedValue);
      if (match) {
        return match;
      }
    }
  }

  return null;
}
