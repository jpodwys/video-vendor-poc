import * as Twilio from "twilio-video";
import { ConnectOptions, TrackOptions, LocalTracks, Room, AudioTrack, VideoTrack, TrackSource, SignalEvent } from "../abstract/VideoCore";

export class TwilioLocalVideoTrack extends VideoTrack {
  private localVideoTrack: Twilio.LocalVideoTrack;

  constructor(options: TrackOptions, localVideoTrack: Twilio.LocalVideoTrack) {
    super(options);
    this.localVideoTrack = localVideoTrack;
  }

  public attach(el: HTMLVideoElement): void {
    this.localVideoTrack.attach(el);
  }

  public detach(): void {
    this.localVideoTrack.detach();
  }

  public stop(): void {
    this.localVideoTrack.stop();
  }
}

export class TwilioLocalAudioTrack extends AudioTrack {
  private localAudioTrack: Twilio.LocalAudioTrack;

  constructor(options: TrackOptions, localAudioTrack: Twilio.LocalAudioTrack) {
    super(options);
    this.localAudioTrack = localAudioTrack;
  }

  public attach(el: HTMLAudioElement): void {
    this.localAudioTrack.attach(el);
  }

  public detach(): void {
    this.localAudioTrack.detach();
  }

  public stop(): void {
    this.localAudioTrack.stop();
  }
}

export class TwilioRemoteVideoTrack extends VideoTrack {
  private remoteVideoTrack: Twilio.RemoteVideoTrack;

  constructor(options: TrackOptions, localVideoTrack: Twilio.RemoteVideoTrack) {
    super(options);
    this.remoteVideoTrack = localVideoTrack;
  }

  public attach(el: HTMLVideoElement): void {
    this.remoteVideoTrack.attach(el);
  }

  public detach(): void {
    this.remoteVideoTrack.detach();
  }

  public stop(): void {
    // Unnecessary
  }
}

export class TwilioRemoteAudioTrack extends AudioTrack {
  private remoteAudioTrack: Twilio.RemoteAudioTrack;

  constructor(options: TrackOptions, remoteAudioTrack: Twilio.RemoteAudioTrack) {
    super(options);
    this.remoteAudioTrack = remoteAudioTrack;
  }

  public attach(el: HTMLAudioElement): void {
    this.remoteAudioTrack.attach(el);
  }

  public detach(): void {
    this.remoteAudioTrack.detach();
  }

  public stop(): void {
    // Unnecessary
  }
}

export class TwilioRoom extends Room {
  private room: Twilio.Room | undefined;
  private localDataTrack: Twilio.LocalDataTrack = new Twilio.LocalDataTrack();
  private localCameraTrack: Twilio.LocalVideoTrack | undefined;
  private localMicTrack: Twilio.LocalAudioTrack | undefined;
  private localScreenVideoTrack: Twilio.LocalVideoTrack | undefined;
  private localScreenAudioTrack: Twilio.LocalAudioTrack | undefined;

  public createLocalTracks(stream: MediaStream): Promise<LocalTracks> {
    return new Promise((resolve, _reject) => {
      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];

      this.localCameraTrack = new Twilio.LocalVideoTrack(videoTrack, { name: 'camera' });
      this.localMicTrack = new Twilio.LocalAudioTrack(audioTrack, { name: 'mic' });

      const video = new TwilioLocalVideoTrack({ id: 'local-video', mediaStreamTrack: videoTrack }, this.localCameraTrack);
      const audio = new TwilioLocalAudioTrack({ id: 'local-mic', mediaStreamTrack: audioTrack }, this.localMicTrack);
      return resolve({ audio, video });
    });
  }

  public async startCamera(track: MediaStreamTrack): Promise<VideoTrack> {
    this.localCameraTrack = new Twilio.LocalVideoTrack(track, { name: 'camera' });
    if (this.room) {
      await this.room.localParticipant.publishTrack(this.localCameraTrack, { priority: 'low' })
        .catch(e => { throw e });
    }
    return new TwilioLocalVideoTrack({ id: 'local-camera', mediaStreamTrack: track }, this.localCameraTrack);
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

  public async changeCamera(track: MediaStreamTrack): Promise<VideoTrack> {
    await this.stopCamera();
    return this.startCamera(track);
  }

  public async changeMic(deviceId: string): Promise<AudioTrack | undefined> {
    if (this.localMicTrack) {
      await this.localMicTrack.restart({ deviceId });
      return new TwilioLocalAudioTrack({ id: 'local-mic', mediaStreamTrack: this.localMicTrack?.mediaStreamTrack }, this.localMicTrack);
    }
  }

  public async connect({ roomName, roomToken }: ConnectOptions): Promise<void> {
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
    // Twilio doesn't emit `participantConnected` for already-present participants
    // but does emit `trackSubscribed` for already-published tracks. So we just need
    // to ensure we get the already-present participants into our participants list
    // before we attach event listeners to our Twilio room instance.
    Array.from(this.room.participants.values()).forEach(({ identity }: Twilio.RemoteParticipant) => {
      const participant = { identity };
      this.participants.set(identity, participant);
      this.emit('participantConnected', participant);
    });
    this.attachListeners(this.room);
  }

  public startScreenshare(stream: MediaStream): Promise<VideoTrack> {
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
      const screen = new TwilioLocalVideoTrack({ id: 'local-screen', mediaStreamTrack: video }, this.localScreenVideoTrack);
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

  public signal(event: SignalEvent): void {
    this.localDataTrack.send(JSON.stringify(event));
  }

  public async disconnect() {
    await this.room?.disconnect();
    [ this.localCameraTrack, this.localMicTrack, this.localScreenVideoTrack, this.localScreenAudioTrack ].forEach((track: Twilio.LocalVideoTrack | Twilio.LocalAudioTrack | undefined) => {
      track?.stop();
    });
  }

  private attachListeners(room: Twilio.Room) {
    room.on('participantConnected', ({ identity }: Twilio.RemoteParticipant) => {
      this.participants.set(identity, { identity });
    });

    room.on('participantDisconnected', ({ identity }: Twilio.RemoteParticipant) => {
      const participant = this.participants.get(identity);
      if (participant) {
        this.participants.delete(identity);
        this.emit('participantDisconnected', participant);
      }
    });

    room.on('trackSubscribed', (track: Twilio.RemoteTrack, _publication: Twilio.RemoteTrackPublication, remoteParticipant: Twilio.RemoteParticipant) => {
      switch(track.kind) {
        case 'data': return;
        case 'audio': {
          // Stop attaching audio tracks here
          track.attach();
          const source = track.name === 'screen' ? 'screenAudio' : 'mic';
          const id = `${track.sid}-${source}`;
          const remoteAudioTrack = new TwilioRemoteAudioTrack({ id, source, mediaStreamTrack: track.mediaStreamTrack }, track as Twilio.RemoteAudioTrack);
          const participant = this.participants.get(remoteParticipant.identity);
          if (participant) {
            participant[source] = remoteAudioTrack;
            this.emit('trackSubscribed', remoteAudioTrack, participant);
          }
          return;
        }
        case 'video': {
          const source = track.name === 'screen' ? 'screen' : 'camera';
          const id = `${track.sid}-${source}`;
          const remoteVideoTrack = new TwilioRemoteVideoTrack({ id, source, mediaStreamTrack: track.mediaStreamTrack }, track as Twilio.RemoteVideoTrack);
          const participant = this.participants.get(remoteParticipant.identity);
          if (participant) {
            participant[source] = remoteVideoTrack;
            this.emit('trackSubscribed', remoteVideoTrack, participant);
          }
          return;
        }
      }
    });

    room.on('trackUnsubscribed', (remoteTrack: Twilio.RemoteTrack, _publication: Twilio.RemoteTrackPublication, remoteParticipant: Twilio.RemoteParticipant) => {
      const participant = this.participants.get(remoteParticipant.identity);
      if (participant) {
        const trackName = remoteTrack.name as TrackSource;
        const track = participant[trackName];
        if (track) {
          delete participant[trackName];
          this.emit('trackUnsubscribed', track, participant);
        }
      }
    });

    room.on('trackUnpublished', (publication: Twilio.RemoteTrackPublication, remoteParticipant: Twilio.RemoteParticipant) => {
      const participant = this.participants.get(remoteParticipant.identity);
      if (participant) {
        const trackName = publication.trackName as TrackSource;
        const track = participant[trackName];
        if (track) {
          delete participant[trackName];
          this.emit('trackUnsubscribed', track, participant);
        }
      }
    });
  }
}
