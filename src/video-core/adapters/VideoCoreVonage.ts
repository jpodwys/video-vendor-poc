import * as OT from '@opentok/client'
import { ConnectOptions, TrackOptions, LocalTracks, Participant, Room, AudioTrack, VideoTrack, TrackSource, SignalEvent, SignalEventTypes } from "../abstract/VideoCore";

const APP_ID = 'f2898af5-23f2-4ee7-a0f4-045661dbfca8';

export class VonageRemoteVideoTrack extends VideoTrack {
  private sourceVideoElement: HTMLVideoElement;

  constructor(options: TrackOptions, sourceVideoElement: HTMLVideoElement) {
    super(options);
    this.sourceVideoElement = sourceVideoElement;
    this.sourceVideoElement.addEventListener('play', () => {
      const stream = this.sourceVideoElement.srcObject as MediaStream;
      const video = stream.getVideoTracks()[0];
      if (video) {
        this.mediaStreamTrack = video;
      }
      if (video && this.element) {
        this.element.srcObject = new MediaStream([video]);
      }
    });
  }

  public attach(el: HTMLVideoElement) {
    super.attach(el);
    el.srcObject = new MediaStream([this.mediaStreamTrack]);
  }

  // public detach() {
  //   super.detach();
  // }

  public stop() {
    this.mediaStreamTrack.stop();
    if (this.element) {
      this.element.srcObject = null;
    }
    this.sourceVideoElement.srcObject = null;
  }
}

export class VonageRemoteAudioTrack extends AudioTrack {
  private subscriber: OT.Subscriber;

  constructor(options: TrackOptions, subscriber: OT.Subscriber) {
    super(options);
    this.subscriber = subscriber;
  }

  public get isEnabled(): boolean {
    return this.subscriber.stream?.hasAudio ?? false;
  }

  public attach() {
    this.element.srcObject = new MediaStream([this.mediaStreamTrack]);
  }

  // public detach() {
  //   super.detach();
  // }

  public stop() {
    this.mediaStreamTrack.stop();
  }
}

export class VonageLocalVideoTrack extends VideoTrack {
  public publisher: OT.Publisher | undefined;
  public videoElement: HTMLVideoElement | undefined;

  public attach(el: HTMLVideoElement) {
    super.attach(el);
    el.srcObject = new MediaStream([this.mediaStreamTrack]);
    this.videoElement = el;
  }

  // public detach() {
  //   super.detach();
  // }

  public stop() {
    this.mediaStreamTrack.stop();
  }
}

export class VonageLocalAudioTrack extends AudioTrack {
  public publisher: OT.Publisher;

  constructor(options: TrackOptions, publisher: OT.Publisher) {
    super(options);
    this.publisher = publisher;
  }

  public get isEnabled(): boolean {
    return this.publisher.stream?.hasAudio ?? true;
  }

  public attach() {
    this.element.srcObject = new MediaStream([this.mediaStreamTrack]);
  }

  // public detach() {
  //   super.detach();
  // }

  public stop() {
    this.mediaStreamTrack.stop();
  }
}

export class VonageRoom extends Room {
  private session: OT.Session | undefined;
  private defaultPublisher: OT.Publisher | undefined;
  private screenPublisher: OT.Publisher | undefined;
  private stream: MediaStream | undefined;

  public get identity(): string {
    const data = this.session?.connection?.data;
    const { identity } = JSON.parse(data ?? '{}');
    return identity ?? '';
  }

  public createLocalTracks(stream: MediaStream): Promise<LocalTracks> {
    return new Promise((resolve, _reject) => {
      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];

      this.defaultPublisher = OT.initPublisher(undefined, {
        insertDefaultUI: false,
        audioSource: audioTrack,
        videoSource: videoTrack,
        name: 'camera',
      });

      this.defaultPublisher.on('videoElementCreated', ({ element }) => {
        if (!this.defaultPublisher) {
          throw new Error('defaultPublisher is undefined');
        }
        const srcStream = (element as HTMLVideoElement).srcObject as MediaStream;
        this.stream = srcStream;
        const srcAudioTrack = srcStream.getAudioTracks()[0];
        const srcVideoTrack = srcStream.getVideoTracks()[0];
        const audio = new VonageLocalAudioTrack({ id: 'local-mic', mediaStreamTrack: srcAudioTrack }, this.defaultPublisher);
        const video = new VonageLocalVideoTrack({ id: 'local-camera', mediaStreamTrack: srcVideoTrack });
        return resolve({ audio, video });
      });
    });
  }

  public connect({ roomName, roomToken }: ConnectOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      this.session = OT.initSession(APP_ID, roomName);
      this.attachListeners();
      this.session.connect(roomToken, (connectError) => {
        if (connectError) {
          return reject(connectError);
        }
        if (!this.defaultPublisher) {
          return reject('Attempted to connect with no publisher');
        }
        this.session?.publish(this.defaultPublisher, (publishError) => {
          if (publishError) {
            return reject(publishError);
          }
          return resolve();
        });
      });
    });
  }

  public startCamera(videoTrack: MediaStreamTrack): Promise<VideoTrack> {
    return new Promise((resolve, reject) => {
      const oldPublisher = this.defaultPublisher;

      const audioTrack = this.stream?.getAudioTracks()[0];
      const clonedAudioTrack = audioTrack?.clone();

      this.defaultPublisher = OT.initPublisher(undefined, {
        insertDefaultUI: false,
        audioSource: clonedAudioTrack,
        videoSource: videoTrack,
        publishAudio: oldPublisher?.stream?.hasAudio,
        name: 'camera',
      });

      // We unpublish after publishing is to ensure the audio hiccup
      // that comes from needing to unpublish is as short as possible.
      this.session?.publish(this.defaultPublisher, () => {
        if (this.session && oldPublisher) {
          this.session.unpublish(oldPublisher);
          oldPublisher.destroy();
        }
      });

      this.defaultPublisher.on('videoElementCreated', ({ element }) => {
        const srcStream = (element as HTMLVideoElement).srcObject as MediaStream;
        this.stream = srcStream;
        const srcVideoTrack = srcStream.getVideoTracks()[0];
        const video = new VonageLocalVideoTrack({ id: 'local-camera', mediaStreamTrack: srcVideoTrack });
        return resolve(video);
      });
    });
  }

  public stopCamera(): Promise<void> {
    return new Promise((resolve, reject) => {
      return this.defaultPublisher?.publishVideo(false), (error: OT.OTError) => {
        if (error) {
          return reject(error);
        }
        resolve();
      };
    });
  }

  public enableMic(enable: boolean): void {
    this.defaultPublisher?.publishAudio(enable);
  }

  public async changeCamera(videoTrack: MediaStreamTrack): Promise<VideoTrack> {
    await this.startCamera(videoTrack);
    const mediaStreamTrack = this.defaultPublisher?.getVideoSource()?.track as MediaStreamTrack;
    return new VonageLocalVideoTrack({ id: 'local-camera', mediaStreamTrack });
  }

  public async changeMic(deviceId: string): Promise<AudioTrack | undefined> {
    if (this.defaultPublisher) {
      await this.defaultPublisher.setAudioSource(deviceId);
      const mediaStreamTrack = this.defaultPublisher.getAudioSource() as MediaStreamTrack;
      return new VonageLocalAudioTrack({ id: 'local-mic', mediaStreamTrack }, this.defaultPublisher);
    }
  }

  public startScreenshare(stream: MediaStream): Promise<VideoTrack> {
    return new Promise((resolve, reject) => {
      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];

      this.screenPublisher = OT.initPublisher(undefined, {
        insertDefaultUI: false,
        audioSource: audioTrack ?? false,
        videoSource: videoTrack,
        name: 'screen',
      });

      this.session?.publish(this.screenPublisher, (error) => {
        if (error) {
          return reject(error);
        }
        const video = new VonageLocalVideoTrack({
          id: this.screenPublisher?.stream?.streamId ?? 'local-screen',
          source: 'screen',
          mediaStreamTrack: videoTrack
        });
        return resolve(video);
      });
    });
  }

  public stopScreenShare(): void {
    if (this.session && this.screenPublisher) {
      this.session.unpublish(this.screenPublisher);
      this.screenPublisher.destroy();
    }
  }

  public signal(event: SignalEvent): void {
    this.session?.signal({
      data: JSON.stringify(event),
    }, (error) => {
      if (error) {
        console.log('Vonage Signal Error', error);
      }
    });
  }

  public disconnect(): Promise<void> {
    return new Promise((resolve, _reject) => {
      this.session?.disconnect();
      this.session?.on('sessionDisconnected', () => {
        this.session = undefined;
        this.defaultPublisher?.destroy();
        this.screenPublisher?.destroy();
        resolve();
      });
    });
  }

  public setAudioOutputDevice(deviceId: string): void {
    // This appears to work despite all of my custom code.
    // It probably works because I'm using the audio track
    // from the video element Vonage emits.
    OT.setAudioOutputDevice(deviceId);

    // This also works great. But It would require me to
    // store the audioOutputDeviceId and apply it on attach
    // like I do for Twilio.
    // Array.from(this.participants.values()).forEach(({ mic, screenAudio }) => {
    //   mic?.element?.setSinkId?.(deviceId);
    //   screenAudio?.element?.setSinkId?.(deviceId);
    // });
  }

  private attachListeners() {
    this.session?.on('streamPropertyChanged', ({ changedProperty, newValue, stream }) => {
      const { identity } = JSON.parse(stream?.connection.data ?? '{}') as { identity: string };
      const source = stream.name as TrackSource;
      const participant = this.participants.get(identity);

      if (!participant) {
        return;
      }

      switch(changedProperty) {
        case 'hasAudio': {
          const track = participant.mic;
          if (track) {
            const event = newValue ? 'trackEnabled' : 'trackDisabled';
            this.emit(event, track, participant);
          }
          return;
        }
        case 'videoDimensions': {
          if (source === 'camera' || source === 'screen') {
            const track = participant[source];
            if (track) {
              this.emit('trackDimensionsChanged', track, participant);
            }
          }
          return;
        }
      }
    });

    this.session?.on('streamCreated', ({ stream }) => {
      if (!this.session) {
        return;
      }

      const subscriber = this.session.subscribe(stream, undefined, { insertDefaultUI: false });

      subscriber.on('videoElementCreated', ({ element }) => {
        const remoteStream = (element as HTMLVideoElement).srcObject as MediaStream;
        const videoTrack = remoteStream.getVideoTracks()[0] as MediaStreamTrack | undefined;
        const audioTrack = remoteStream.getAudioTracks()[0] as MediaStreamTrack | undefined;
        // identity is set by me on the server - it is analagous to Twilio's RemoteParticipant.identity.
        const { identity } = JSON.parse(stream?.connection.data ?? '{}') as { identity: string };
        // streamName is set by me on the publishing user's device.
        const source = stream.name as TrackSource;
        // connectionId is set by Vonage - it is analogous to Twilio's RemoteTrack.sid
        // because we only get one connectionId per stream and each stream has two tracks,
        // we'll need to add something to each track's id to make them unique.
        const connectionId = subscriber.stream?.connection.connectionId;

        let remoteParticipant: Participant = { identity };

        if (this.participants.has(identity)) {
          remoteParticipant = this.participants.get(identity) as Participant;
        } else {
          this.participants.set(identity, remoteParticipant);
          this.emit('participantConnected', remoteParticipant);
        }

        element.addEventListener('play', () => {
          const updatedStream = (element as HTMLVideoElement).srcObject as MediaStream;
          const updatedVideo = updatedStream.getVideoTracks()[0] as MediaStreamTrack | undefined;
          if (updatedVideo && (source === 'camera' || source === 'screen')) {
            const id = `${connectionId}-${source}`;
            const updatedRemoteVideoTrack = new VonageRemoteVideoTrack({ id, source: source, mediaStreamTrack: updatedVideo }, element as HTMLVideoElement);
            remoteParticipant[source] = updatedRemoteVideoTrack;
          }
        });

        if (connectionId) {
          if (videoTrack && (source === 'camera' || source === 'screen')) {
            const id = `${connectionId}-${source}`;
            const remoteVideoTrack = new VonageRemoteVideoTrack({ id, source, mediaStreamTrack: videoTrack }, element as HTMLVideoElement);
            remoteParticipant[source] = remoteVideoTrack;
            this.emit('trackSubscribed', remoteVideoTrack, remoteParticipant);
          }
          if (audioTrack) {
            const key = source === 'screen' ? 'screenAudio' : 'mic';
            const id = `${connectionId}-${key}`;
            const remoteAudioTrack = new VonageRemoteAudioTrack({ id, source: key, mediaStreamTrack: audioTrack }, subscriber);
            remoteParticipant[key] = remoteAudioTrack;
            this.emit('trackSubscribed', remoteAudioTrack, remoteParticipant);
          }
        }
      });

      subscriber.on('videoDisabled', ({ reason }) => {
        if (reason === 'publishVideo') {
          const { identity } = JSON.parse(stream?.connection.data ?? '{}') as { identity: string };
          const remoteParticipant = this.participants.get(identity);
          const source = stream.name as TrackSource;
          if (remoteParticipant) {
            const track = remoteParticipant[source];
            if (track) {
              delete remoteParticipant[source];
              this.emit('trackUnpublished', track, remoteParticipant);
            }
          }
        }
      });
    });

    this.session?.on('streamDestroyed', ({ stream }) => {
      const { identity } = JSON.parse(stream.connection.data ?? '{}');
      const participant = this.participants.get(identity);
      if (participant) {
        const { camera, mic, screen, screenAudio } = participant;
        let tracks = [ camera, mic ];
        if (stream.name === 'screen') {
          tracks = [ screen, screenAudio ];
        }
        tracks.forEach(track => {
          if (track) {
            delete participant[track.source];
            this.emit('trackUnpublished', track, participant);
          }
        });
        if (!participant.camera && !participant.mic && !participant.screen && !participant.screenAudio) {
          this.participants.delete(identity);
          this.emit('participantDisconnected', participant);
        }
      }
    });

    this.session?.on('signal', ({ data }) => {
      const { type, to } = JSON.parse(data ?? '{}');
      if (to !== this.identity) {
        return;
      }
      switch(type as SignalEventTypes) {
        case SignalEventTypes.ForceMute: {
          this.enableMic(false);
          this.emit('localMicDisabled');
        }
      }
    });
  }
}
