import { getPinImageSources } from "@/lib/server/media";

export function resolveRecipeImageSources(
  imageUrl: string | null | undefined,
  fallbackImageUrl: string | null | undefined,
  mediaJson: string | null | undefined,
  rawJson: string | null | undefined,
) {
  const imageSources = getPinImageSources(mediaJson, rawJson);
  const resolvedImageUrl =
    imageUrl ?? fallbackImageUrl ?? imageSources.imageUrl ?? null;
  const previewImageUrl =
    resolvedImageUrl === imageSources.imageUrl &&
    imageSources.previewImageUrl !== imageSources.imageUrl
      ? imageSources.previewImageUrl
      : null;

  return {
    imageUrl: resolvedImageUrl,
    previewImageUrl,
  };
}
