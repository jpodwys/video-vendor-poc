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

/**
 * Goals
 * * Don't change our UI layout at all
 * * Don't subscribe to anyone twice
 * * Treat Vonage as a data layer
 *
 * Limitations
 * * Publisher is what applies video filters
 * * Publisher is the only way to get my video with filters applied
 * * Publisher outputs DOM at time of creation but not thereafter
 * * Vonage always has a publisher whereas Twilio doesn't always have a video track
 * * Changing from normal camera to PTZ camera requires unpublishing your microphone for a few moments
 *
 * Questions
 * * Does Publisher.getWebrtcStream() return a stream with filter already applied?
 *
 * Needs
 * * Publisher/Subscriber.getWebRtcStream must be public
 * * * We need this public method to expose the stream with filters/processors already applied
 * * We need a means of creating an audio track in a first-party way - meaning that Vonage's setAudioOutputDevice still works
 *
 * Conclusions
 * * We can solve the Publisher issues by saving a single Publisher instance and relying directly on the associated MediaStream to render custom UI.
 * * We can solve the Subscriber issues by eagerly attaching audio elements, saving a single Subscriber instance, and relying on the associated MediaStream to render custom UI.
 * * * We will also need to keep track of our own audio elements so that we can re-implement setAudioOutputDevice - managing our own audio tracks will probably break Vonage's setSinkId implementation.
 * In all cases, we will most likely not have an AudioTrack class. We will manage audio tracks completely internally within each VideoCore implementation.
 */

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

/**
 * DAMNIT
 * Vonage will require that we provide both a video and audio track to
 * a single Publisher instance because publishing audio and video using
 * separate Publisher instnaces will double the cost of using Vonage.
 */

/**
 * In Vonage you cannot independently publish/unpublish audio and video.
 * A Session instance publishes a Publisher instance.
 */
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

/**
 * With Vonage, switching between a non-PTZ camera and a PTZ camera will
 * require us to unpublish our publisher (INCLUDING AUDIO) and then publish
 * a new publisher. The participant will have no audio or video presence
 * in the room during this time. This is because we need to use the
 * publisher's name attribute which cannot change once published.
 */
export class VonageRoom extends VCRoom {
  private session: OT.Session | undefined;
  private defaultPublisher: OT.Publisher | undefined;
  private screenPublisher: OT.Publisher | undefined;

  // constructor (options: IVCRoomOptions) {
  //   super(options);
  //   this.session = OT.initSession(APP_ID, options.roomName);
  // }

  /**
   * For Vonage, I'm making the deliberate tradeoff to keep the camera light on
   * even when the camera's video feed is not being transmitted.
   */
  public createLocalTracks(stream: MediaStream): Promise<VCLocalTracks> {
    return new Promise((resolve, _reject) => {
      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];

      /**
       * Unfortunately, Vonage doesn't allow you to both provide your own MediaStreamTracks
       * AND disable then re-enable your hardware. If you want to provide your own tracks,
       * you have to be content with your camera light staying on while you're not publishing.
       * The only way to do this differently is to allow Vonage to manage acquiring your
       * hardware. But you also can't provide a MediaStreamTrackConstraints object. You must
       * use Vonage's custom properties. Thanks for the quality SDK, Vonage.
       */
      this.defaultPublisher = OT.initPublisher(undefined, {
        insertDefaultUI: false,
        audioSource: audioTrack,
        videoSource: videoTrack,
      });
      //@ts-ignore
      window.publisher = this.defaultPublisher;

      /**
       * You can't give Vonage a MediaStreamTrack as stated above. That means you have to
       * rely on Vonage to get it for you. Then you have to do this janky-ass shit to get a
       * video element for some reason so you can pull the MediaStream off its srcObject.
       * Thanks for the highly flexible SDK, Vonage.
       */
      this.defaultPublisher.on('videoElementCreated', ({ element }) => {
        const srcStream = (element as HTMLVideoElement).srcObject as MediaStream;
        //@ts-ignore
        window.stream = srcStream;
        const srcAudioTrack = srcStream.getAudioTracks()[0];
        const srcVideoTrack = srcStream.getVideoTracks()[0];
        const audio = new VonageLocalAudioTrack({ mediaStreamTrack: srcAudioTrack });
        const video = new VonageLocalVideoTrack({ mediaStreamTrack: srcVideoTrack });
        // element.addEventListener('play', () => {
        //   console.log('HERCULES LOCAL PLAY EVENT');
        //   const updatedStream = (element as HTMLVideoElement).srcObject as MediaStream;
        //   const updatedVideoTrack = updatedStream.getVideoTracks()[0];
        //   const video = new VonageLocalVideoTrack({ mediaStreamTrack: updatedVideoTrack });
        //   this.emit('temporaryVonageUpdatedLocalVideoTrackEvent', video);
        // });
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

  public enableCamera(enable: boolean): Promise<VCTrack | void> {
    return new Promise((resolve, reject) => {
      this.defaultPublisher?.publishVideo(enable, (error) => {
        if (error) {
          return reject (error);
        }
        if (enable) {
          const mediaStreamTrack = this.defaultPublisher?.getVideoSource().track as MediaStreamTrack;
          const localVideoTrack = new VonageLocalVideoTrack({ mediaStreamTrack });
          return resolve(localVideoTrack);
        }
        return resolve();
      });
    });
  }

  public enableMic(enable: boolean): void {
    this.defaultPublisher?.publishAudio(enable);
  }

  // public async changeCamera(deviceId: string): Promise<VCTrack> {
  //   await this.defaultPublisher?.setVideoSource(deviceId);
  //   const mediaStreamTrack = this.defaultPublisher?.getVideoSource()?.track as MediaStreamTrack;
  //   return new VonageLocalVideoTrack({ mediaStreamTrack });
  // }

  public async changeCamera(track: MediaStreamTrack): Promise<VCTrack> {
    const oldTrack = this.defaultPublisher?.getVideoSource().track as MediaStreamTrack;
    //@ts-ignore
    await this.defaultPublisher?.replaceTrackAndUpdate(oldTrack, track);
    const mediaStreamTrack = this.defaultPublisher?.getVideoSource()?.track as MediaStreamTrack;
    return new VonageLocalVideoTrack({ mediaStreamTrack });
  }

  public async changeMic(deviceId: string): Promise<VCTrack> {
    await this.defaultPublisher?.setAudioSource(deviceId);
    const mediaStreamTrack = this.defaultPublisher?.getAudioSource() as MediaStreamTrack;
    return new VonageLocalAudioTrack({ mediaStreamTrack });
  }

  public publish(track: VonageLocalVideoTrack | VonageLocalAudioTrack): void {
    if (track.publisher) {
      this.session?.publish(track.publisher);
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
