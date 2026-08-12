import type { NormalizedLandmark } from "./vision-utils";

export function mouthOpenRatioFromLandmarks(
  landmarks: NormalizedLandmark[],
  source: { width: number; height: number },
) {
  const leftCorner = landmarks[61];
  const rightCorner = landmarks[291];
  const upperInnerLip = landmarks[13];
  const lowerInnerLip = landmarks[14];
  if (!leftCorner || !rightCorner || !upperInnerLip || !lowerInnerLip) return 0;

  const distance = (first: NormalizedLandmark, second: NormalizedLandmark) =>
    Math.hypot(
      (first.x - second.x) * source.width,
      (first.y - second.y) * source.height,
    );
  const mouthWidth = distance(leftCorner, rightCorner);
  if (mouthWidth < 1) return 0;

  return Math.min(1, distance(upperInnerLip, lowerInnerLip) / mouthWidth);
}

export function teethVisibilityFromRgba(pixels: Uint8ClampedArray) {
  let visiblePixels = 0;
  let opaquePixels = 0;
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const alpha = pixels[index + 3];
    if (alpha < 128) continue;
    opaquePixels += 1;
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    if (luminance >= 185 && chroma <= 45) visiblePixels += 1;
  }
  return opaquePixels ? visiblePixels / opaquePixels : 0;
}
