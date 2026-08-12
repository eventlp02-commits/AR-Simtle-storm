import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CameraPermissionTimeoutError,
  cameraEnvironmentIssue,
  requestCameraStream,
} from "../app/lib/camera-access";

afterEach(() => {
  vi.useRealTimers();
});

describe("cameraEnvironmentIssue", () => {
  it("rejects insecure non-local pages", () => {
    expect(
      cameraEnvironmentIssue({
        secureContext: false,
        hostname: "example.com",
        embedded: false,
        hasMediaDevices: true,
        userAgent: "Chrome",
      }),
    ).toMatch(/HTTPS/);
  });

  it("explains that embedded browsers may suppress camera permission", () => {
    expect(
      cameraEnvironmentIssue({
        secureContext: true,
        hostname: "example.com",
        embedded: true,
        hasMediaDevices: true,
        userAgent: "Chrome",
      }),
    ).toMatch(/系统 Chrome/);
  });

  it("accepts a supported top-level secure browser", () => {
    expect(
      cameraEnvironmentIssue({
        secureContext: true,
        hostname: "example.com",
        embedded: false,
        hasMediaDevices: true,
        userAgent: "Chrome",
      }),
    ).toBeNull();
  });
});

describe("requestCameraStream", () => {
  it("fails visibly when a hidden permission prompt stays pending", async () => {
    vi.useFakeTimers();
    let resolveStream!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn(
      () => new Promise<MediaStream>((resolve) => (resolveStream = resolve)),
    );
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;

    const pending = requestCameraStream(getUserMedia, {}, 8_000);
    const rejection = expect(pending).rejects.toBeInstanceOf(
      CameraPermissionTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(8_000);
    await rejection;

    resolveStream(stream);
    await Promise.resolve();
    expect(stop).toHaveBeenCalledOnce();
  });
});
