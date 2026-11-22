// The browser preview's player: a PlaybackEngine that "plays" songs with a timer, no sound.
import type { PlaybackEngine, PlaybackState, RepeatMode, Song } from '@zplayer/library';

export class FakeEngine implements PlaybackEngine {
  readonly capabilities = { volume: false, devices: true, queue: true };
  private queue: Song[] = [];
  private index = 0;
  private playing = false;
  private shuffle = false;
  private repeat: RepeatMode = 'off';
  private position = 0;
  private at = Date.now();
  private listeners = new Set<() => void>();
  private cached?: { key: string; value: PlaybackState };
  private timer = 0;

  /** The preview needs Song objects for `playSongs(uris)` and the songs of an album or playlist URI. */
  constructor(private lookup: { song: (uri: string) => Song | undefined; context: (uri: string) => Song[] }) {}

  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => void this.listeners.delete(listener); };
  private emit() { this.cached = undefined; this.listeners.forEach(listener => listener()); }

  get upcoming() { return this.queue.slice(this.index + 1, this.index + 21); }

  getState(): PlaybackState {
    const key = `${this.index}|${this.playing}|${this.shuffle}|${this.repeat}|${this.position}|${this.queue.length}`;
    if (this.cached?.key === key) return this.cached.value;
    const song = this.queue[this.index];
    const value: PlaybackState = {
      song, playing: this.playing, shuffle: this.shuffle, repeat: this.repeat,
      positionMs: Math.min(this.position + (this.playing ? Date.now() - this.at : 0), song?.durationMs ?? 0),
    };
    this.cached = { key, value };
    return value;
  }

  private begin(queue: Song[], index: number) {
    this.queue = queue; this.index = index; this.position = 0; this.at = Date.now(); this.playing = true;
    window.clearTimeout(this.timer);
    this.schedule();
    this.emit();
  }

  /** At the end of a song, go on to the next one (the preview keeps playing). */
  private schedule() {
    window.clearTimeout(this.timer);
    const song = this.queue[this.index];
    if (!song || !this.playing) return;
    const left = Math.max(500, song.durationMs - (this.position + Date.now() - this.at));
    this.timer = window.setTimeout(() => void this.next(), left);
  }

  async playSongs(uris: string[], index: number) {
    const songs = uris.map(uri => this.lookup.song(uri)).filter((song): song is Song => !!song);
    if (songs.length) this.begin(songs, Math.min(index, songs.length - 1));
  }
  async playContext(contextUri: string, offsetUri?: string) {
    const songs = this.lookup.context(contextUri);
    const index = offsetUri ? Math.max(0, songs.findIndex(song => song.uri === offsetUri)) : 0;
    if (songs.length) this.begin(songs, index);
  }
  async playUpcoming(offset: number) { this.index += 1 + offset; this.begin(this.queue, Math.min(this.index, this.queue.length - 1)); }
  async toggle() {
    this.position = this.getState().positionMs; this.at = Date.now(); this.playing = !this.playing;
    this.schedule(); this.emit();
  }
  async next() {
    const last = this.index >= this.queue.length - 1;
    if (last && this.repeat === 'off') { this.playing = false; this.position = 0; this.emit(); return; }
    this.begin(this.queue, this.repeat === 'one' ? this.index : last ? 0 : this.index + 1);
  }
  async previous() {
    this.begin(this.queue, this.getState().positionMs > 3000 ? this.index : Math.max(0, this.index - 1));
  }
  async seek(ms: number) { this.position = ms; this.at = Date.now(); this.schedule(); this.emit(); }
  async setShuffle(on: boolean) { this.shuffle = on; this.emit(); }
  async setRepeat(mode: RepeatMode) { this.repeat = mode; this.emit(); }
}
