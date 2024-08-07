import * as Twilio from "twilio-video";
import { IVCConnectOptions, IVCTrackOptions, VCLocalTracks, VCRoom, VCTrack } from "../abstract/VideoCore";

export class TwilioLocalVideoTrack extends VCTrack {
  private localVideoTrack: Twilio.LocalVideoTrack;

  constructor(options: IVCTrackOptions, localVideoTrack: Twilio.LocalVideoTrack) {
    super(options);
    this.localVideoTrack = localVideoTrack;
  }

  public attach(el: HTMLVideoElement): void {
    this.localVideoTrack.attach(el);
  }

  public detach(): void {
    this.localVideoTrack.detach();
  }
}

export class TwilioLocalAudioTrack extends VCTrack {
  private localAudioTrack: Twilio.LocalAudioTrack;

  constructor(options: IVCTrackOptions, localAudioTrack: Twilio.LocalAudioTrack) {
    super(options);
    this.localAudioTrack = localAudioTrack;
  }

  public attach(el: HTMLAudioElement): void {
    this.localAudioTrack.attach(el);
  }

  public detach(): void {
    this.localAudioTrack.detach();
  }
}

export class TwilioRemoteVideoTrack extends VCTrack {
  private remoteVideoTrack: Twilio.RemoteVideoTrack;

  constructor(options: IVCTrackOptions, localVideoTrack: Twilio.RemoteVideoTrack) {
    super(options);
    this.remoteVideoTrack = localVideoTrack;
  }

  public attach(el: HTMLVideoElement): void {
    this.remoteVideoTrack.attach(el);
  }

  public detach(): void {
    this.remoteVideoTrack.detach();
  }
}

// export class TwilioRemoteAudioTrack extends VCTrack {

// }

export class TwilioRoom extends VCRoom {
  private room: Twilio.Room | undefined;
  private localDataTrack: Twilio.LocalDataTrack = new Twilio.LocalDataTrack();
  private localCameraTrack: Twilio.LocalVideoTrack | undefined;
  private localMicTrack: Twilio.LocalAudioTrack | undefined;
  private localScreenVideoTrack: Twilio.LocalVideoTrack | undefined;
  private localScreenAudioTrack: Twilio.LocalAudioTrack | undefined;

  public createLocalTracks(stream: MediaStream): Promise<VCLocalTracks> {
    return new Promise((resolve, _reject) => {
      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];

      this.localCameraTrack = new Twilio.LocalVideoTrack(videoTrack);
      this.localMicTrack = new Twilio.LocalAudioTrack(audioTrack);

      const video = new TwilioLocalVideoTrack({ mediaStreamTrack: videoTrack }, this.localCameraTrack);
      const audio = new TwilioLocalAudioTrack({ mediaStreamTrack: audioTrack }, this.localMicTrack);
      return resolve({ audio, video });
    });
  }

  public async startCamera(track: MediaStreamTrack): Promise<VCTrack> {
    this.localCameraTrack = new Twilio.LocalVideoTrack(track);
    if (this.room) {
      await this.room.localParticipant.publishTrack(this.localCameraTrack, { priority: 'low' })
        .catch(e => { throw e });
    }
    return new TwilioLocalVideoTrack({ mediaStreamTrack: track }, this.localCameraTrack);
  }

  public stopCamera(): Promise<void> {
    if (this.localCameraTrack) {
      this.localCameraTrack.stop();
      this.room?.localParticipant.unpublishTrack(this.localCameraTrack);
    }
    return Promise.resolve();
  }

  public enableMic(enable: boolean): void {
    this.localMicTrack?.enable(enable);
  }

  public async changeCamera(track: MediaStreamTrack): Promise<VCTrack> {
    await this.stopCamera();
    return this.startCamera(track);
  }

  public async changeMic(deviceId: string): Promise<VCTrack | undefined> {
    if (this.localMicTrack) {
      await this.localMicTrack.restart({ deviceId });
      return new TwilioLocalAudioTrack({ mediaStreamTrack: this.localMicTrack?.mediaStreamTrack }, this.localMicTrack);
    }
  }

  public async connect({ roomName, roomToken }: IVCConnectOptions): Promise<void> {
    const tracks = [ this.localDataTrack, this.localCameraTrack, this.localMicTrack ].filter(track => !!track) as Twilio.LocalTrack[];
    this.room = await Twilio.connect(roomToken, {
      name: roomName,
      tracks,
      dominantSpeaker: true,
      networkQuality: { local: 1, remote: 1 },
      preferredAudioCodecs: ['opus'],
      preferredVideoCodecs: [{ codec: 'VP8', simulcast: true }],
      bandwidthProfile: {
        video: {
          mode: 'collaboration',
          trackSwitchOffMode: 'detected',
          clientTrackSwitchOffControl: 'auto',
        },
      },
    });
    this.attachListeners(this.room);
  }

  public startScreenshare(stream: MediaStream): Promise<VCTrack> {
    return new Promise((resolve, reject) => {
      if (!this.room) {
        return reject('No room');
      }
      const video = stream.getVideoTracks()[0];
      const audio = stream.getVideoTracks()[0];
      this.localScreenVideoTrack = new Twilio.LocalVideoTrack(video, { name: 'screen' });
      if (audio) {
        this.localScreenAudioTrack = new Twilio.LocalAudioTrack(audio, { name: 'screenAudio' });
      }
      [ this.localScreenVideoTrack, this.localScreenAudioTrack ].forEach(track => {
        if (track) {
          this.room?.localParticipant?.publishTrack(track);
        }
      });
      const screen = new TwilioLocalVideoTrack({ mediaStreamTrack: video }, this.localScreenVideoTrack);
      resolve(screen);
    });
  }

  public stopScreenShare(): void {
    if (!this.room) {
      return;
    }
    [ this.localScreenVideoTrack, this.localScreenAudioTrack ].forEach(track => {
      if (track) {
        this.room?.localParticipant?.unpublishTrack(track);
      }
    });
    this.localScreenVideoTrack = undefined;
    this.localScreenAudioTrack = undefined;
  }

  public async disconnect() {
    await this.room?.disconnect();
    [ this.localCameraTrack, this.localMicTrack, this.localScreenVideoTrack, this.localScreenAudioTrack ].forEach((track: Twilio.LocalVideoTrack | Twilio.LocalAudioTrack | undefined) => {
      track?.stop();
    });
  }

  private attachListeners(room: Twilio.Room) {
    room.on('trackSubscribed', (track: Twilio.RemoteTrack) => {
      switch(track.kind) {
        case 'data': return;
        case 'audio': track.attach(); return;
        case 'video': {
          const remoteVideoTrack = new TwilioRemoteVideoTrack({ mediaStreamTrack: track.mediaStreamTrack }, track);
          this.emit('trackSubscribed', remoteVideoTrack);
        }
      }
    });
  }
}
