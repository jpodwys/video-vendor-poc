import * as OT from '@opentok/client'
import { IVCConnectOptions, VCLocalTracks, VCRoom, VCTrack } from "../abstract/VideoCore";

export type VCSubscriber = OT.Subscriber & {
  _: {
    webRtcStream: () => MediaStream;
  };
}
export type VCPublisher = OT.Publisher & {
  _: {
    webRtcStream: () => MediaStream;
  };
}

const APP_ID = 'f2898af5-23f2-4ee7-a0f4-045661dbfca8';

export class VonageRemoteVideoTrack extends VCTrack {
  private videoElement: HTMLVideoElement | undefined;

  public attach(el: HTMLVideoElement) {
    el.srcObject = new MediaStream([this.mediaStreamTrack]);
    this.videoElement = el;
  }

  public detach() {
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.videoElement = undefined;
  }
}

export class VonageRemoteAudioTrack extends VCTrack {
  private audioElement: HTMLAudioElement | undefined;

  public attach(el: HTMLAudioElement) {
    el.srcObject = new MediaStream([this.mediaStreamTrack]);
    this.audioElement = el;
  }

  public detach() {
    if (this.audioElement) {
      this.audioElement.srcObject = null;
    }
    this.audioElement = undefined;
  }
}

export class VonageLocalVideoTrack extends VCTrack {
  public publisher: VCPublisher | undefined;
  public videoElement: HTMLVideoElement | undefined;

  public attach(el: HTMLVideoElement) {
    el.srcObject = new MediaStream([this.mediaStreamTrack]);
    this.videoElement = el;
  }

  public detach() {
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.videoElement = undefined;
  }
}

export class VonageLocalAudioTrack extends VCTrack {
  public publisher: VCPublisher | undefined;
  public audioElement: HTMLAudioElement | undefined;

  public attach(el: HTMLAudioElement) {
    el.srcObject = new MediaStream([this.mediaStreamTrack]);
    this.audioElement = el;
  }

  public detach() {
    if (this.audioElement) {
      this.audioElement.srcObject = null;
    }
    this.audioElement = undefined;
  }
}

export class VonageRoom extends VCRoom {
  private session: OT.Session | undefined;
  private defaultPublisher: OT.Publisher | undefined;
  private screenPublisher: OT.Publisher | undefined;
  private stream: MediaStream | undefined;

  public createLocalTracks(stream: MediaStream): Promise<VCLocalTracks> {
    return new Promise((resolve, _reject) => {
      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];

      this.defaultPublisher = OT.initPublisher(undefined, {
        insertDefaultUI: false,
        audioSource: audioTrack,
        videoSource: videoTrack,
      });

      this.defaultPublisher.on('videoElementCreated', ({ element }) => {
        const srcStream = (element as HTMLVideoElement).srcObject as MediaStream;
        this.stream = srcStream;
        //@ts-ignore
        window.stream = srcStream;
        const srcAudioTrack = srcStream.getAudioTracks()[0];
        const srcVideoTrack = srcStream.getVideoTracks()[0];
        const audio = new VonageLocalAudioTrack({ mediaStreamTrack: srcAudioTrack });
        const video = new VonageLocalVideoTrack({ mediaStreamTrack: srcVideoTrack });
        return resolve({ audio, video });
      });
    });
  }

  public connect({ roomName, roomToken }: IVCConnectOptions): Promise<void> {
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

  public startCamera(videoTrack: MediaStreamTrack): Promise<VCTrack> {
    return new Promise((resolve, reject) => {
      const oldPublisher = this.defaultPublisher;

      const audioTrack = this.stream?.getAudioTracks()[0];
      const clonedAudioTrack = audioTrack?.clone();

      this.defaultPublisher = OT.initPublisher(undefined, {
        insertDefaultUI: false,
        audioSource: clonedAudioTrack,
        videoSource: videoTrack,
        publishAudio: oldPublisher?.stream?.hasAudio,
      });

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
        const video = new VonageLocalVideoTrack({ mediaStreamTrack: srcVideoTrack });
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

  public async changeCamera(videoTrack: MediaStreamTrack): Promise<VCTrack> {
    await this.startCamera(videoTrack);
    const mediaStreamTrack = this.defaultPublisher?.getVideoSource()?.track as MediaStreamTrack;
    return new VonageLocalVideoTrack({ mediaStreamTrack });
  }

  public async changeMic(deviceId: string): Promise<VCTrack | undefined> {
    if (this.defaultPublisher) {
      await this.defaultPublisher.setAudioSource(deviceId);
      const mediaStreamTrack = this.defaultPublisher.getAudioSource() as MediaStreamTrack;
      return new VonageLocalAudioTrack({ mediaStreamTrack });
    }
  }

  public startScreenshare(stream: MediaStream): Promise<VCTrack> {
    return new Promise((resolve, reject) => {
      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];

      this.screenPublisher = OT.initPublisher(undefined, {
        insertDefaultUI: false,
        audioSource: audioTrack,
        videoSource: videoTrack,
      });

      this.session?.publish(this.screenPublisher, (error) => {
        if (error) {
          return reject(error);
        }
        const video = new VonageLocalVideoTrack({ mediaStreamTrack: videoTrack });
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

  private attachListeners() {
    this.session?.on('streamCreated', ({ stream }) => {
      if (!this.session) {
        return;
      }

      /**
       * Per my conversation my Vonage on 2/27, it's clear we need to keep
       * track of the HTMLVideoElement emitted by the Subscriber instance.
       * This is for two reasons
       * 1. The videoElementCreated event fires when the stream object first
       *  becomes available
       * 2. We will also have to attach an event listener to the
       *  HTMLVideoElement's onplay handler to ensure our stream instance
       *  doesn't become stale.
       *  https://api.support.vonage.com/hc/en-us/articles/10901330247964-How-to-update-subscriber-stream-when-manipulating-video-element
       *
       * With this in mind, I should wait to emit streamSubscribed until the Subscriber emits videoElementCreated and I have the element.
       */

      const subscriber = this.session.subscribe(stream, undefined, { insertDefaultUI: false });
      subscriber.on('videoElementCreated', ({ element }) => {
        const remoteStream = (element as HTMLVideoElement).srcObject as MediaStream;
        const videoTrack = remoteStream.getVideoTracks()[0] as MediaStreamTrack | undefined;
        const audioTrack = remoteStream.getAudioTracks()[0] as MediaStreamTrack | undefined;
        if (videoTrack) {
          const remoteVideoTrack = new VonageRemoteVideoTrack({ mediaStreamTrack: videoTrack });
          this.remoteTracks.push(remoteVideoTrack);
          this.emit('trackSubscribed', remoteVideoTrack);
        }
        if (audioTrack) {
          const remoteAudioTrack = new VonageRemoteAudioTrack({ mediaStreamTrack: audioTrack });
          remoteAudioTrack.attach(document.createElement('audio'));
          // this.remoteTracks.push(remoteAudioTrack);
          // this.emit('temporaryVonageSubscriberEvent', remoteAudioTrack);
        }
        // THIS IS NECESSARY TO ENSURE THE VIDEO DOESN'T DIE WHEN THE SIMULCAST LAYER SWITCHES
        // element.addEventListener('play', () => {
        //   const updatedStream = (element as HTMLVideoElement).srcObject as MediaStream;
        // });
      });
      // Attach audio imperatively - save the audio track so we can change sinkId when needed
      // this.attachAudioTrack(stream.streamId, audioTrack);
      // VonageRemoteVideoTrack extends abstract class VideoCoreTrack
      // const remoteVideoTrack = new VonageRemoteVideoTrack(someOptions);
      // remoteVideoTrack.setSubscriber(subscriber);
      // this.emit('streamSubscribed', {
      //   remoteVideoTrack,
      //   remoteAudioTrack,
      // });
    });
  }

}
