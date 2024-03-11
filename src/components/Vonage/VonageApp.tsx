import { useCallback, useState } from 'react';
import './App.css';
import OT from '@opentok/client';
import Video from './Video';

const APP_ID = '399ad9b6-0cfe-4bee-aafc-a0139847d061';
const LocalStorageSessionIdKey = 'OTSessionId';
const LocalStorageTokenKey = 'OTToken';

export default function VonageApp() {
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState(localStorage.getItem(LocalStorageSessionIdKey) || '');
  const [token, setToken] = useState(localStorage.getItem(LocalStorageTokenKey) || '');
  const [session, _setSession] = useState<OT.Session>(OT.initSession(APP_ID, sessionId));
  const [publisher, setPublisher] = useState<OT.Publisher | undefined>();
  const [stream, setStream] = useState<MediaStream | undefined>();
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const saveInputsToLocalStorage = (event: React.SyntheticEvent<HTMLFormElement>) => {
    const formData = new FormData(event.currentTarget);
    const { sessionId, token } = Object.fromEntries(formData)as { sessionId: string, token: string };
    localStorage.setItem(LocalStorageSessionIdKey, sessionId);
    localStorage.setItem(LocalStorageTokenKey, token);
  }

  const disableCamera = () => {
    publisher?.publishVideo(false);
    const videoTrack = stream?.getVideoTracks()[0];
    if (videoTrack) {
      // stream?.removeTrack(videoTrack);
      videoTrack?.stop();
    }
  }

  const disableMic = () => {
    publisher?.publishAudio(false);
  }

  const enableCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const videoTrack = stream.getVideoTracks()[0];
    stream.addTrack(videoTrack);
    setStream(stream);
    publisher?.publishVideo(true);
    publisher?.setVideoSource(videoTrack.getSettings().deviceId as string);
  };

  const enableMic = () => {
    publisher?.publishAudio(true);
  };

  const acquireHardware = async () => {
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setStream(s);
    const p = OT.initPublisher(undefined, {
      insertDefaultUI: false,
      videoSource: s.getVideoTracks()[0],
      audioSource: s.getAudioTracks()[0],
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
          <button onClick={disableCamera}>Disable Camera</button>
          <button onClick={disableMic}>Disable Mic</button>
          <button onClick={enableCamera}>Enable Camera</button>
          <button onClick={enableMic}>Enable Mic</button>
        </div>
        { !!stream &&
          <Video muted srcObject={stream} />
        }
        {
          Array.from(remoteStreams.values()).map((remoteStream, i) => {
            return <Video key={i} srcObject={remoteStream} />;
          })
        }
      </header>
    </div>
  );
}