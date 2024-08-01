import { useCallback, useState } from 'react';
import '../../App.css';
import OT from '@opentok/client';
import Video from '../Video';

const APP_ID = 'f2898af5-23f2-4ee7-a0f4-045661dbfca8';
const LocalStorageSessionIdKey = 'OTSessionId';
const LocalStorageTokenKey = 'OTToken';

export default function VonageApp() {
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState(localStorage.getItem(LocalStorageSessionIdKey) || '');
  const [token, setToken] = useState(localStorage.getItem(LocalStorageTokenKey) || '');
  const [session, setSession] = useState<OT.Session>(OT.initSession(APP_ID, sessionId));
  const [publisher, setPublisher] = useState<OT.Publisher | undefined>();
  const [stream, setStream] = useState<MediaStream | undefined>();
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  /**
   * Unfortunately, Vonage only provides a public means of checking whether your device is
   * enabled AFTER publishing. At that point, `publisher.stream` exists which contains
   * `hasVideo` and `hasAudio`. Prior to that, you can't check. Therefore, these booleans
   * are necessary. Thanks for the carefully-designed SDK, Vonage.
   */
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);

  const saveInputsToLocalStorage = (event: React.SyntheticEvent<HTMLFormElement>) => {
    const formData = new FormData(event.currentTarget);
    const { sessionId, token } = Object.fromEntries(formData) as { sessionId: string, token: string };
    setSession(OT.initSession(APP_ID, sessionId));
    localStorage.setItem(LocalStorageSessionIdKey, sessionId);
    localStorage.setItem(LocalStorageTokenKey, token);
  }

  const toggleCamera = () => {
    publisher?.publishVideo(!cameraEnabled);
    setCameraEnabled(!cameraEnabled);
  }

  /**
   * 1. Leave the camera light on always
   * 2. Say no more PTZ devices allowed
   * 3. Acquire my own stream, then when the user wants to restart
   *  their camera, I have to create a new publisher with the same audio track
   *
   * stop original publisher
   * start new publisher
   * either there's two of you for a moment
   * OR there's no mic audio for you for a moment
   */

  const toggleMic = () => {
    publisher?.publishAudio(!micEnabled);
    setMicEnabled(!micEnabled);
  }

  const acquireHardware = async () => {
    /**
     * Unfortunately, Vonage doesn't allow you to both provide your own MediaStreamTracks
     * AND disable then re-enable your hardware. If you want to provide your own tracks,
     * you have to be content with your camera light staying on while you're not publishing.
     * The only way to do this differently is to allow Vonage to manage acquiring your
     * hardware. But you also can't provide a MediaStreamTrackConstraints object. You must
     * use Vonage's incomplete custom properties. Thanks for the quality SDK, Vonage.
     *
     * I think this only matters if I'm trying to acquire a PTZ device. And, in the scenario
     * where I need to unpublish and start publishing again, I suppose I can publish my second
     * publication prior to ending my first to prevent any dead publication time. Ugh.
     */
    const p = OT.initPublisher(undefined, {
      insertDefaultUI: false,
      publishAudio: true,
      publishVideo: true,
    });
    //@ts-ignore
    window.publisher = p;

    /**
     * You can't give Vonage a MediaStreamTrack as stated above. That means you have to
     * rely on Vonage to get it for you. Then you have to do this janky-ass shit to get a
     * video element for some reason so you can pull the MediaStream off its srcObject.
     * Thanks for the highly flexible SDK, Vonage.
     */
    p.on('videoElementCreated', ({ element }) => {
      const s = (element as HTMLVideoElement).srcObject as MediaStream | undefined;
      setStream(s);
    });
    setPublisher(p);
  };

  const connect = useCallback((token: string) => {
    if (publisher) {
      session.connect(token, (error) => {
        if (error) {
          throw error;
        } else {
          setConnected(true);
          session.publish(publisher);
        }
      });
      session.on('streamCreated', ({ stream }) => {
        const subscriber = session.subscribe(stream, undefined, {
          insertDefaultUI: false,
        });
        /**
         * The janky-ass shit continues with remote streams. You have to grab remote
         * MediaStreams off of, you guessed it, video elements. But wait, there's more!
         * Now that you have your remote stream, you also have to add a play event
         * listener so that your UI doesn't break every time the remote stream undergoes
         * a simulcast layer switch. Thanks for the no-nonsense SDK, Vonage.
         */
        subscriber.on('videoElementCreated', ({ element }) => {
          const remoteStream = (element as HTMLVideoElement).srcObject as MediaStream;
          remoteStreams.set(stream.streamId, remoteStream);
          setRemoteStreams(new Map(remoteStreams));
          element.addEventListener('play', () => {
            const updatedStream = (element as HTMLVideoElement).srcObject as MediaStream;
            remoteStreams.set(stream.streamId, updatedStream);
            setRemoteStreams(new Map(remoteStreams));
          });
        });
      });
    }
  }, [publisher]);

  const onSubmit = (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveInputsToLocalStorage(event);
    if (token) {
      connect(token);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <div>
          <button onClick={acquireHardware}>Acquire Hardware</button>
        </div>
        {!connected &&
          <form onSubmit={onSubmit}>
            <input name="sessionId" placeholder="Session ID" value={sessionId} onChange={(e) => setSessionId(e.target.value)} />
            <input name="token" placeholder="Token" value={token} onChange={(e) => setToken(e.target.value)} />
            <input type="submit" disabled={!stream} value="Connect" />
          </form>
        }
        <div>
          <button onClick={toggleCamera}>{`${cameraEnabled ? 'Disable' : 'Enable'} Camera`}</button>
          <button onClick={toggleMic}>{`${micEnabled ? 'Disable' : 'Enable'} mic`}</button>
        </div>
        {/* { !!stream &&
          <Video mirror muted srcObject={stream} />
        }
        {
          Array.from(remoteStreams.values()).map((remoteStream, i) => {
            return <Video key={i} srcObject={remoteStream} />;
          })
        } */}
      </header>
    </div>
  );
}