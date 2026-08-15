import { describe, expect, it } from "vitest";

import { getPinImageSources, getPinVideoSource } from "@/lib/server/media";

describe("getPinImageSources", () => {
  it("extracts full and preview image URLs from Pinterest size variants", () => {
    const mediaJson = JSON.stringify({
      images: {
        "236x": {
          url: "https://images.example.com/pin-236.jpg",
          width: 236,
          height: 354,
        },
        "564x": {
          url: "https://images.example.com/pin-564.jpg",
          width: 564,
          height: 846,
        },
      },
    });

    expect(getPinImageSources(mediaJson, null)).toEqual({
      imageUrl: "https://images.example.com/pin-564.jpg",
      previewImageUrl: "https://images.example.com/pin-236.jpg",
    });
  });

  it("falls back to a single image URL when only one variant exists", () => {
    const mediaJson = JSON.stringify({
      images: {
        orig: {
          url: "https://images.example.com/pin-full.jpg",
        },
      },
    });

    expect(getPinImageSources(mediaJson, null)).toEqual({
      imageUrl: "https://images.example.com/pin-full.jpg",
      previewImageUrl: null,
    });
  });

  it("falls back to the raw payload and returns nulls when no image exists", () => {
    const fallbackRawJson = JSON.stringify({
      image_url: "https://images.example.com/pin-raw.jpg",
    });

    expect(getPinImageSources(null, fallbackRawJson)).toEqual({
      imageUrl: "https://images.example.com/pin-raw.jpg",
      previewImageUrl: null,
    });
    expect(getPinImageSources(JSON.stringify({ foo: "bar" }), null)).toEqual({
      imageUrl: null,
      previewImageUrl: null,
    });
  });
});

describe("getPinVideoSource", () => {
  it("finds a direct Pinterest video asset and preserves its media type", () => {
    expect(getPinVideoSource(JSON.stringify({ videos: { "720p": { url: "https://video.example.com/recipe.mp4?token=1", mime_type: "video/mp4" } } }), null)).toEqual({
      videoUrl: "https://video.example.com/recipe.mp4?token=1",
      mediaType: "video/mp4",
    });
  });

  it("does not treat streaming playlists as direct video files", () => {
    expect(getPinVideoSource(JSON.stringify({ video_url: "https://video.example.com/recipe.m3u8" }), null)).toBeNull();
  });
});
