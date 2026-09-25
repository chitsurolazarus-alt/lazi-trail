import { volumeToGain } from './audioLogic';
import { Ambience } from './Ambience';
import { MusicEngine } from './MusicEngine';
import { SampleBank, type PlaySampleOptions, type SampleName } from './SampleBank';

export type Channel = 'music' | 'sfx' | 'ambience';

export interface AudioSettings {
  musicVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  muted: boolean;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Loudness each bus is scaled to before the player's slider, so the defaults mix well. */
const BASE = { music: 0.6, sfx: 0.95, ambience: 0.55 } as const;

interface FollowVoice {
  panner: PannerNode;
  follow: () => Vec3 | null;
  until: number;
}

/**
 * Web Audio owner: creates the context on the first user gesture (browsers refuse earlier),
 * routes everything through Music / SFX / Ambience buses with independent volume and a global
 * mute, and provides positional (3D) voices for things that pass Lazi by.
 */
export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Record<Channel, GainNode> | null = null;
  private voices: FollowVoice[] = [];
  private readonly readyCallbacks: Array<() => void> = [];
  private unlocking: Promise<void> | null = null;

  samples: SampleBank | null = null;
  music: MusicEngine | null = null;
  ambience: Ambience | null = null;

  constructor(
    private state: AudioSettings,
    private readonly onChange?: (s: AudioSettings) => void,
  ) {}

  get settings(): Readonly<AudioSettings> {
    return this.state;
  }

  get unlocked(): boolean {
    return this.context !== null && this.context.state === 'running';
  }

  get ctx(): AudioContext | null {
    return this.context;
  }

  /** Runs `fn` once audio is available (immediately if it already is). */
  whenReady(fn: () => void): void {
    if (this.buses) fn();
    else this.readyCallbacks.push(fn);
  }

  /** Arrange for the first tap / key press anywhere to start audio. */
  installUnlock(target: EventTarget = window): void {
    const events = ['pointerdown', 'keydown', 'touchend'] as const;
    const handler = (): void => {
      for (const e of events) target.removeEventListener(e, handler, true);
      void this.unlock();
    };
    for (const e of events) target.addEventListener(e, handler, true);
  }

  unlock(): Promise<void> {
    this.unlocking ??= this.create();
    return this.unlocking;
  }

  private async create(): Promise<void> {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.context = ctx;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);

    const master = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    master.connect(compressor).connect(ctx.destination);
    this.master = master;
    this.buses = {
      music: ctx.createGain(),
      sfx: ctx.createGain(),
      ambience: ctx.createGain(),
    };
    for (const bus of Object.values(this.buses)) bus.connect(master);
    this.applyVolumes();

    this.samples = new SampleBank(ctx);
    this.music = new MusicEngine(ctx, this.buses.music);
    this.ambience = new Ambience(ctx, this.buses.ambience, this.samples);
    void this.samples.load();

    for (const fn of this.readyCallbacks.splice(0)) fn();
  }

  /* ---------------------------------------------------------------- volumes */

  private applyVolumes(): void {
    if (!this.buses || !this.master || !this.context) return;
    const t = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.state.muted ? 0 : 1, t, 0.05);
    this.buses.music.gain.setTargetAtTime(
      volumeToGain(this.state.musicVolume) * BASE.music,
      t,
      0.05,
    );
    this.buses.sfx.gain.setTargetAtTime(volumeToGain(this.state.sfxVolume) * BASE.sfx, t, 0.05);
    this.buses.ambience.gain.setTargetAtTime(
      volumeToGain(this.state.ambienceVolume) * BASE.ambience,
      t,
      0.05,
    );
  }

  setVolume(channel: Channel, value: number): void {
    const v = Math.min(1, Math.max(0, value));
    this.state = { ...this.state, [`${channel}Volume`]: v } as AudioSettings;
    this.applyVolumes();
    this.onChange?.(this.state);
  }

  setMuted(muted: boolean): void {
    this.state = { ...this.state, muted };
    this.applyVolumes();
    this.onChange?.(this.state);
  }

  /* ------------------------------------------------------------------ output */

  get sfxBus(): GainNode | null {
    return this.buses?.sfx ?? null;
  }

  /** Run a synth function on the SFX bus right now. */
  synth(fn: (ctx: AudioContext, dest: AudioNode, t: number) => void, delay = 0): void {
    if (!this.context || !this.buses) return;
    fn(this.context, this.buses.sfx, this.context.currentTime + 0.005 + delay);
  }

  sample(name: SampleName, opt: PlaySampleOptions = {}): void {
    if (!this.samples || !this.buses) return;
    this.samples.play(name, this.buses.sfx, opt);
  }

  /** A positioned voice: `play` receives a node to connect to. `follow` keeps it tracking a moving source. */
  spatial(
    at: Vec3,
    play: (ctx: AudioContext, dest: AudioNode, t: number) => void,
    opts: { follow?: () => Vec3 | null; seconds?: number; delay?: number } = {},
  ): void {
    if (!this.context || !this.buses) return;
    const ctx = this.context;
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = 7;
    panner.rolloffFactor = 1.15;
    panner.maxDistance = 260;
    setPosition(panner, at);
    panner.connect(this.buses.sfx);
    play(ctx, panner, ctx.currentTime + 0.005 + (opts.delay ?? 0));
    const seconds = opts.seconds ?? 2;
    if (opts.follow)
      this.voices.push({ panner, follow: opts.follow, until: ctx.currentTime + seconds });
    else window.setTimeout(() => panner.disconnect(), (seconds + 1) * 1000);
  }

  spatialSample(name: SampleName, at: Vec3, opt: PlaySampleOptions = {}): void {
    this.spatial(at, (_ctx, dest) => {
      this.samples?.play(name, dest, opt);
    });
  }

  /** A looping voice on the SFX bus with its own panner (engine rumble); the caller updates it. */
  createPanner(dest: 'sfx' | 'ambience' = 'sfx'): PannerNode | null {
    if (!this.context || !this.buses) return null;
    const panner = this.context.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = 8;
    panner.rolloffFactor = 1.2;
    panner.connect(this.buses[dest]);
    return panner;
  }

  /** Keep the listener on the camera and any following voices on their sources. */
  updateListener(pos: Vec3, forward: Vec3): void {
    const ctx = this.context;
    if (!ctx) return;
    const l = ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos.x;
      l.positionY.value = pos.y;
      l.positionZ.value = pos.z;
      l.forwardX.value = forward.x;
      l.forwardY.value = forward.y;
      l.forwardZ.value = forward.z;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
    const now = ctx.currentTime;
    this.voices = this.voices.filter((v) => {
      if (now > v.until) {
        v.panner.disconnect();
        return false;
      }
      const p = v.follow();
      if (p) setPosition(v.panner, p);
      return true;
    });
  }

  /* --------------------------------------------------------------- lifecycle */

  suspend(): void {
    void this.context?.suspend();
  }

  resume(): void {
    if (this.context && this.context.state === 'suspended') void this.context.resume();
  }

  dispose(): void {
    this.music?.dispose();
    this.ambience?.dispose();
    void this.context?.close();
    this.context = null;
    this.buses = null;
  }
}

function setPosition(p: PannerNode, v: Vec3): void {
  if (p.positionX) {
    p.positionX.value = v.x;
    p.positionY.value = v.y;
    p.positionZ.value = v.z;
  } else {
    p.setPosition(v.x, v.y, v.z);
  }
}
