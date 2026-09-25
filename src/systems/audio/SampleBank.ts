/** Every recorded sample the game uses (converted to MP3 by tools/fetch-assets.mjs). */
export const SAMPLE_NAMES = [
  'step_tar_0',
  'step_tar_1',
  'step_tar_2',
  'step_tar_3',
  'step_gravel_0',
  'step_gravel_1',
  'step_gravel_2',
  'step_wood_0',
  'step_wood_1',
  'step_wood_2',
  'step_metal_0',
  'step_metal_1',
  'step_metal_2',
  'land_0',
  'land_1',
  'land_heavy',
  'stumble_0',
  'stumble_1',
  'crash_metal',
  'crash_wood',
  'crash_plank',
  'clank_0',
  'clank_1',
  'bark_0',
  'bark_1',
  'ui_click',
  'ui_select',
  'ui_back',
  'ui_confirm',
  'ui_error',
  'ui_toggle',
  'cash_0',
  'cash_1',
  'cash_2',
] as const;
export type SampleName = (typeof SAMPLE_NAMES)[number];

export interface PlaySampleOptions {
  volume?: number;
  /** Playback rate (pitch); 1 = normal. */
  rate?: number;
  /** AudioContext time to start at (default: now). */
  when?: number;
}

/**
 * Decodes and plays the recorded samples. Loading happens in the background after the first user
 * gesture; anything requested before a sample is ready is quietly skipped.
 */
export class SampleBank {
  private readonly buffers = new Map<SampleName, AudioBuffer>();
  private loading: Promise<void> | null = null;

  constructor(private readonly ctx: AudioContext) {}

  get ready(): boolean {
    return this.buffers.size === SAMPLE_NAMES.length;
  }

  load(): Promise<void> {
    this.loading ??= this.loadAll();
    return this.loading;
  }

  private async loadAll(): Promise<void> {
    const base = import.meta.env.BASE_URL;
    await Promise.all(
      SAMPLE_NAMES.map(async (name) => {
        try {
          const res = await fetch(`${base}assets/audio/sfx/${name}.mp3`);
          if (!res.ok) return;
          const data = await res.arrayBuffer();
          this.buffers.set(name, await this.ctx.decodeAudioData(data));
        } catch {
          // A missing/undecodable clip just means silence for that sound.
        }
      }),
    );
  }

  has(name: SampleName): boolean {
    return this.buffers.has(name);
  }

  /** Play a sample into `dest`. Returns the source (so callers can stop it) or null if not loaded. */
  play(
    name: SampleName,
    dest: AudioNode,
    opt: PlaySampleOptions = {},
  ): AudioBufferSourceNode | null {
    const buffer = this.buffers.get(name);
    if (!buffer) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = opt.rate ?? 1;
    const gain = this.ctx.createGain();
    gain.gain.value = opt.volume ?? 1;
    src.connect(gain).connect(dest);
    src.start(opt.when ?? 0);
    src.onended = () => {
      src.disconnect();
      gain.disconnect();
    };
    return src;
  }
}
