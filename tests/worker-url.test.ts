import { describe, expect, it } from "vitest";
import { normalizeWorkerUrl } from "../app/lib/worker-url";

describe("normalizeWorkerUrl", () => {
  it("turns a vinext file URL into a same-origin worker path", () => {
    const bundledUrl = new URL("file:///_next/static/vision.worker-abc123.js");

    expect(normalizeWorkerUrl(bundledUrl)).toBe(
      "/_next/static/vision.worker-abc123.js",
    );
  });

  it("keeps an HTTP worker URL unchanged for the static build", () => {
    const bundledUrl = new URL(
      "https://example.com/AR-Simtle-storm/assets/vision.worker-abc123.js",
    );

    expect(normalizeWorkerUrl(bundledUrl)).toBe(bundledUrl);
  });
});
