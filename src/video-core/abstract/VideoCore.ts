import { EventEmitter } from 'events';

export type KeyValueObject = {[key: string]: any};

export type VCLocalTracks = {
  audio: VCTrack;
  video: VCTrack;
}

export type TrackKind = 'default' | 'screen' | 'ptz';

interface VideoCoreEvents {
  participantConnected: () => void;
  participantDisconnected: () => void;
  dominantSpeakerChanged: () => void;
  trackSubscribed: (track: VCTrack) => void;
  trackUnsubscribed: () => void;
  trackUnpublished: () => void;
  trackEnabled: () => void;
  trackDisabled: () => void;
  trackStarted: () => void;
  trackMessage: () => void;
  trackDimensionsChanged: () => void;
  trackSwitchedOff: () => void;
  trackSwitchedOn: () => void;
  disconnected: () => void;
}

export declare interface VCRoom {
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

export interface IVCRoomOptions {
  roomName: string;
}

export interface IVCConnectOptions {
  roomName: string;
  roomToken: string;
}

/**
 * In order to use this transwitch architecture, I think
 * it would be best to place the practice preference
 * lookup in factory methods that return the necessary
 * vendor-specific class instaces.
 */

/**
 * My current VideoCore architecture assumes that VCTrack
 * instances will only be instantiated by VCRoom instances.
 * I should write an eslint rule if I keep this assumption.
 */
export abstract class VCRoom extends EventEmitter {
  // remoteTracks is just for temporary PoC work. This will most likely be replaced with something else.
  public readonly remoteTracks: VCTrack[] = [];
  public abstract createLocalTracks(stream: MediaStream): Promise<VCLocalTracks>;
  // I need to ensure this approach can handle PTZ devices with a name/locals property for both vendors
  public abstract startCamera(track: MediaStreamTrack): Promise<VCTrack>;
  public abstract stopCamera(): Promise<void>;
  public abstract enableMic(enable: boolean): void;
  public abstract changeCamera(track: MediaStreamTrack): Promise<VCTrack>;
  // changeMic current expects a deviceId - this is because we should always have an audio track
  public abstract changeMic(deviceId: string): Promise<VCTrack | undefined>;
  // Should connect accept tracks or should it just be assumed it will automatically publish all existing local tracks?
  public abstract connect(options: IVCConnectOptions): Promise<void>;
  public abstract disconnect(): Promise<void>;
  public abstract startScreenshare(stream: MediaStream): Promise<VCTrack>;
  public abstract stopScreenShare(): void;
  // public abstract publish(track: VCTrack): void;
  // public abstract unpublish(track: VCTrack): void;
  // public abstract signal(data: KeyValueObject): void;
  // public abstract setAudioOutputDevice(deviceId: string): void;
  // protected options: IVCRoomOptions;

  // constructor(options: IVCRoomOptions) {
  //   super();
  //   this.options = options;
  // }
}

export interface IVCTrackOptions {
  // kind: TrackKind;
  mediaStreamTrack: MediaStreamTrack;
}

export abstract class VCTrack extends EventEmitter {
  public readonly mediaStreamTrack: MediaStreamTrack;
  // protected kind: TrackKind;

  public abstract attach(el: HTMLMediaElement): void;
  public abstract detach(): void;

  constructor({ mediaStreamTrack }: IVCTrackOptions) {
    super();
    // this.kind = kind;
    this.mediaStreamTrack = mediaStreamTrack;
  }
}
