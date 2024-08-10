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
  // remoteParticipant | null
  dominantSpeakerChanged: (participant: Participant) => void;
  trackSubscribed: (track: AudioTrack | VideoTrack, participant: Participant) => void;
  trackUnsubscribed: (track: AudioTrack | VideoTrack, participant: Participant) => void;
  trackUnpublished: (track: AudioTrack | VideoTrack, participant: Participant) => void;
  // publication (used for trackSid and isTrackEnabled)
  trackEnabled: (track: AudioTrack | VideoTrack) => void;
  // same event handler as above - publication (used for trackSid and isTrackEnabled)
  trackDisabled: (track: AudioTrack | VideoTrack) => void;
  /**
   * I DON'T THINK THIS IS NECESSARY FOR TWILIO
   * IS THIS THE EQUIVALENT TO WHAT VONAGE NEEDS TO KEEP PLAYING
   * SIMULCAST TRACK LAYER SWITCHES????
   */
  // track (uses sid and mediaStreamTrack)
  trackStarted: (track: AudioTrack | VideoTrack) => void;
  // data, track (unused), participant (used for identity)
  trackMessage: () => void;
  // track
  trackDimensionsChanged: () => void;
  // track, publication (unused), participant (used for sid and identity)
  trackSwitchedOff: () => void;
  // track, publication (unused), participant (used for sid and identity)
  trackSwitchedOn: () => void;
  // room (unused), error
  disconnected: () => void;
  /**
   * This is not supported as a room-level event in Twilio.
   * I have to attach per-participant event handlers for this.
   */
  // participant (used for identity and networkQualityLevel)
  networkQualityChanged: () => void;
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

export interface RoomOptions {
  roomName: string;
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
  public readonly localParticipant: Participant | undefined;
  public abstract createLocalTracks(stream: MediaStream): Promise<LocalTracks>;
  // I need to ensure this approach can handle PTZ devices with a name property for both vendors
  public abstract startCamera(track: MediaStreamTrack): Promise<VideoTrack>;
  public abstract stopCamera(): Promise<void>;
  public abstract enableMic(enable: boolean): void;
  public abstract changeCamera(track: MediaStreamTrack): Promise<VideoTrack>;
  public abstract changeMic(deviceId: string): Promise<AudioTrack | undefined>;
  // Should connect accept tracks or should it just be assumed it will automatically publish all existing local tracks?
  public abstract connect(options: ConnectOptions): Promise<void>;
  /**
   * This should cleanup all event listeners
   */
  public abstract disconnect(): Promise<void>;
  public abstract startScreenshare(stream: MediaStream): Promise<VideoTrack>;
  public abstract stopScreenShare(): void;
  public abstract signal(event: SignalEvent): void;
  // public abstract setAudioOutputDevice(deviceId: string): void;
}

export interface Participant {
  identity: string;
  // networkQuality: number;
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

  public abstract attach(el: HTMLMediaElement): void;
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
}

export abstract class VideoTrack extends Track {
  public readonly kind = 'video';
  public readonly isPTZ: boolean;
  public get dimensions () {
    const { width, height } = this.mediaStreamTrack.getSettings();
    return { width, height };
  }
  constructor(options: TrackOptions) {
    super(options);
    this.isPTZ = options.isPTZ ?? false;
  }
}
