/**
 * I think it's become clear that VideoCore needs to maintain an internal
 * dataset of participants and tracks. Additionally, in considering what
 * VideoCore should emit, I wonder if it should emit the object I'll
 * eventually store in redux. The need to normalize VideoCore's output
 * prior to storing it in redux feels like an unnecessary step.
 *
 * If I continue outputting data I then need to normalize, it would be in
 * the interest of changing as little application code as possible.
 * However, if I make VideoCore output what I want to store in redux, the
 * result will be simpler application code.
 */

import { EventEmitter } from 'events';

export type KeyValueObject = {[key: string]: any};

export enum SignalEventTypes {
  ForceMute = 'ForceMute',
}

export type SignalEvent = {
  type: SignalEventTypes;
  to: string;
  from: string;
  payload?: KeyValueObject;
}

export type LocalTracks = {
  audio: AudioTrack;
  video: VideoTrack;
}

// export type TrackKind = 'default' | 'screen' | 'ptz';

interface VideoCoreEvents {
  participantConnected: (participant: Participant) => void;
  participantDisconnected: (participant: Participant) => void;
  dominantSpeakerChanged: (participant: Participant) => void;
  trackSubscribed: (track: AudioTrack | VideoTrack, participant: Participant) => void;
  trackUnsubscribed: (track: AudioTrack | VideoTrack, participant: Participant) => void;
  trackUnpublished: (track: AudioTrack | VideoTrack, participant: Participant) => void;
  trackEnabled: (track: AudioTrack, participant: Participant) => void;
  trackDisabled: (track: AudioTrack, participant: Participant) => void;
  trackStarted: (track: AudioTrack | VideoTrack) => void;
  trackMessage: (participant: Participant) => void;
  trackDimensionsChanged: (track: VideoTrack, participant: Participant) => void;
  trackSwitchedOff: (track: VideoTrack, participant: Participant) => void;
  trackSwitchedOn: (track: VideoTrack, participant: Participant) => void;
  disconnected: (error?: string) => void;
  localMicDisabled: () => void;
}

export declare interface Room {
  on<U extends keyof VideoCoreEvents>(
    event: U,
    listener: VideoCoreEvents[U]
  ): this;

  once<U extends keyof VideoCoreEvents>(
    event: U,
    listener: VideoCoreEvents[U]
  ): this;

  off<U extends keyof VideoCoreEvents>(
    event: U,
    listener: VideoCoreEvents[U]
  ): this;

  emit<U extends keyof VideoCoreEvents>(
    event: U, ...args: Parameters<VideoCoreEvents[U]>
  ): boolean;
}

export interface ConnectOptions {
  roomName: string;
  roomToken: string;
}

/**
 * My current VideoCore architecture assumes that Track
 * instances will only be instantiated by Room instances.
 * I should write an eslint rule if I keep this assumption.
 */
export abstract class Room extends EventEmitter {
  public readonly participants: Map<string, Participant> = new Map();
  public abstract get identity(): string;
  public abstract createLocalTracks(stream: MediaStream): Promise<LocalTracks>;
  public abstract startCamera(track: MediaStreamTrack): Promise<VideoTrack>;
  public abstract stopCamera(): Promise<void>;
  public abstract enableMic(enable: boolean): void;
  public abstract changeCamera(track: MediaStreamTrack): Promise<VideoTrack>;
  public abstract changeMic(deviceId: string): Promise<AudioTrack | undefined>;
  public abstract connect(options: ConnectOptions): Promise<void>;
  /**
   * This should cleanup all event listeners
   */
  public abstract disconnect(): Promise<void>;
  public abstract startScreenshare(stream: MediaStream): Promise<VideoTrack>;
  public abstract stopScreenShare(): void;
  public abstract signal(event: SignalEvent): void;
  public abstract setAudioOutputDevice(deviceId: string): void;
}

export interface Participant {
  identity: string;
  camera?: VideoTrack;
  mic?: AudioTrack;
  screen?: VideoTrack;
  screenAudio?: AudioTrack;
}

export type TrackSource = 'camera' | 'mic' | 'screen' | 'screenAudio';

export interface TrackOptions {
  id: string;
  mediaStreamTrack: MediaStreamTrack;
  source?: TrackSource;
  isPTZ?: boolean;
}

abstract class Track {
  public readonly id: string;
  public readonly source: TrackSource;
  protected mediaStreamTrack: MediaStreamTrack;
  public abstract get element(): HTMLVideoElement | HTMLAudioElement | undefined;

  public abstract detach(): void;
  public abstract stop(): void;

  constructor({ id, mediaStreamTrack, source }: TrackOptions) {
    this.id = id;
    this.source = source ?? 'camera';
    this.mediaStreamTrack = mediaStreamTrack;
  }
}

export abstract class AudioTrack extends Track {
  public readonly kind = 'audio';
  public abstract get isEnabled(): boolean;
  private _element: HTMLAudioElement = document.createElement('audio');
  public get element(): HTMLAudioElement {
    return this._element;
  }

  public abstract attach(): void;

  public detach(): void {
    if (this._element) {
      this._element.srcObject = null;
      this._element.remove();
      this._element = document.createElement('audio');
    }
  }
}

export abstract class VideoTrack extends Track {
  public readonly kind = 'video';
  public readonly isPTZ: boolean;
  private _element: HTMLVideoElement | undefined;
  public get element(): HTMLVideoElement | undefined {
    return this._element;
  }
  public get dimensions () {
    const { width, height } = this.mediaStreamTrack.getSettings();
    return { width, height };
  }

  public attach(el: HTMLVideoElement): void {
    this._element = el;
  }
  public detach(): void {
    if (this._element) {
      this._element.srcObject = null;
      this._element.remove();
      this._element = undefined;
    }
  }

  constructor(options: TrackOptions) {
    super(options);
    this.isPTZ = options.isPTZ ?? false;
  }
}
