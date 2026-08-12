export interface AudioTrack {
  loop: boolean;
  muted: boolean;
  volume: number;
  currentTime: number;
  play(): Promise<void> | void;
  pause(): void;
}

export class WebAudioTrack implements AudioTrack {
  loop = false;
  muted = false;
  currentTime = 0;
  private gainValue = 1;
  private readonly gain: GainNode;
  private readonly buffer: Promise<AudioBuffer>;
  private source: AudioBufferSourceNode | null = null;
  private request = 0;

  constructor(
    private readonly context: AudioContext,
    url: string,
  ) {
    this.gain = context.createGain();
    this.gain.connect(context.destination);
    this.buffer = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Audio download failed: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data));
  }

  get volume() {
    return this.gainValue;
  }

  set volume(value: number) {
    this.gainValue = Math.max(0, Math.min(1, value));
    this.gain.gain.value = this.muted ? 0 : this.gainValue;
  }

  async play() {
    const request = ++this.request;
    const buffer = await this.buffer;
    if (request !== this.request) return;
    this.source?.stop();
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = this.loop;
    source.connect(this.gain);
    source.onended = () => {
      if (this.source === source) this.source = null;
    };
    this.source = source;
    this.gain.gain.value = this.muted ? 0 : this.gainValue;
    source.start(0, Math.max(0, this.currentTime));
  }

  pause() {
    this.request += 1;
    if (!this.source) return;
    this.source.stop();
    this.source.disconnect();
    this.source = null;
  }
}

export interface AudioFrameClock {
  now(): number;
  request(callback: (timestampMs: number) => void): number;
  cancel(id: number): void;
}

export interface AudioUnlockGate {
  unlock(): Promise<void> | void;
}

export interface EffectAudioTracks {
  surprise: AudioTrack;
  rain: AudioTrack;
  fireworks: AudioTrack;
}

export interface EffectAudioUrls {
  surprise: string;
  rain: string;
  fireworks: string;
}

type LoopTrackName = "rain" | "fireworks";

const AUDIO_FADE_OUT_MS = 600;
const TRACK_VOLUMES: Record<keyof EffectAudioTracks, number> = {
  surprise: 0.82,
  rain: 0.52,
  fireworks: 0.68,
};

export class EffectAudioController {
  private surprisePlayed = false;
  private muted = false;
  private rainRequested = false;
  private readonly active: Record<LoopTrackName, boolean> = {
    rain: false,
    fireworks: false,
  };
  private readonly fadeFrames: Record<LoopTrackName, number | null> = {
    rain: null,
    fireworks: null,
  };

  constructor(
    private readonly tracks: EffectAudioTracks,
    private readonly clock: AudioFrameClock,
    private readonly unlockGate: AudioUnlockGate,
  ) {}

  async unlock() {
    await this.unlockGate.unlock();
  }

  startRain() {
    this.rainRequested = true;
    if (this.muted) return;
    this.cancelFade("rain");
    const track = this.tracks.rain;
    track.loop = true;
    track.volume = this.effectiveVolume("rain");
    if (!this.active.rain) {
      track.currentTime = 0;
      this.safePlay(track);
    }
    this.active.rain = true;
  }

  stopRain() {
    this.rainRequested = false;
    this.fadeOut("rain");
  }

  startFireworks() {
    if (this.muted) return;
    this.cancelFade("fireworks");
    const track = this.tracks.fireworks;
    track.loop = false;
    track.volume = this.effectiveVolume("fireworks");
    track.currentTime = 0;
    this.active.fireworks = true;
    this.safePlay(track);

    if (!this.surprisePlayed) {
      this.surprisePlayed = true;
      const surprise = this.tracks.surprise;
      surprise.loop = false;
      surprise.volume = this.effectiveVolume("surprise");
      surprise.currentTime = 0;
      this.safePlay(surprise);
    }
  }

  stopFireworks() {
    this.fadeOut("fireworks");
  }

  stopAll() {
    this.stopRain();
    this.stopFireworks();
    this.tracks.surprise.pause();
    this.tracks.surprise.currentTime = 0;
  }

  setMuted(muted: boolean) {
    if (this.muted === muted) return;
    this.muted = muted;
    if (muted) {
      this.fadeOut("rain");
      this.fadeOut("fireworks");
      this.tracks.surprise.pause();
      this.tracks.surprise.currentTime = 0;
      return;
    }
    if (this.rainRequested) this.startRain();
  }

  isMuted() {
    return this.muted;
  }

  private fadeOut(name: LoopTrackName) {
    if (!this.active[name] || this.fadeFrames[name] !== null) return;
    const track = this.tracks[name];
    const startedAt = this.clock.now();
    const startingVolume = track.volume;
    const tick = (timestampMs: number) => {
      const progress = Math.min(1, (timestampMs - startedAt) / AUDIO_FADE_OUT_MS);
      track.volume = startingVolume * (1 - progress);
      if (progress < 1) {
        this.fadeFrames[name] = this.clock.request(tick);
        return;
      }
      this.fadeFrames[name] = null;
      this.active[name] = false;
      track.pause();
      track.currentTime = 0;
    };
    this.fadeFrames[name] = this.clock.request(tick);
  }

  private cancelFade(name: LoopTrackName) {
    const frame = this.fadeFrames[name];
    if (frame === null) return;
    this.clock.cancel(frame);
    this.fadeFrames[name] = null;
  }

  private safePlay(track: AudioTrack) {
    try {
      const playback = track.play();
      if (playback) void playback.catch(() => undefined);
    } catch {
      // Playback is enhancement-only; camera and rendering must continue.
    }
  }

  private effectiveVolume(name: keyof EffectAudioTracks) {
    return this.muted ? 0 : TRACK_VOLUMES[name];
  }
}

export function createEffectAudioController(urls: EffectAudioUrls) {
  const context = new AudioContext();
  const createTrack = (url: string) => new WebAudioTrack(context, url);
  return new EffectAudioController(
    {
      surprise: createTrack(urls.surprise),
      rain: createTrack(urls.rain),
      fireworks: createTrack(urls.fireworks),
    },
    {
      now: () => performance.now(),
      request: (callback) => requestAnimationFrame(callback),
      cancel: (id) => cancelAnimationFrame(id),
    },
    {
      unlock: async () => {
        if (context.state === "suspended") await context.resume();
      },
    },
  );
}
