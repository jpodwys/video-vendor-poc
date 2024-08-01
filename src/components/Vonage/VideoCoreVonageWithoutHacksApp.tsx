import { useEffect, useState } from 'react';
import '../../App.css';
import Video from '../Video';
import { VonageRoom } from '../../video-core/adapters/VideoCoreVonageWithoutHacks';
import { VCTrack } from '../../video-core/abstract/VideoCore';

const LocalStorageSessionIdKey = 'OTSessionId';
const LocalStorageTokenKey = 'OTToken';

export default function VideoCoreVonageWithoutHacksApp() {
  const [room, _setRoom] = useState<VonageRoom>(new VonageRoom());
  const [connected, setConnected] = useState(false);
  const [roomName, setRoomName] = useState(localStorage.getItem(LocalStorageSessionIdKey) || '');
  const [roomToken, setRoomToken] = useState(localStorage.getItem(LocalStorageTokenKey) || '');
  const [audioTrack, setAudioTrack] = useState<VCTrack | undefined>();
  const [videoTrack, setVideoTrack] = useState<VCTrack | undefined>();
  const [remoteTracks, setRemoteTracks] = useState<VCTrack[]>([]);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [micDeviceId, setMicDeviceId] = useState('');
  const [cameraDeviceId, setCameraDeviceId] = useState('');
  const [screen, setScreen] = useState<VCTrack | undefined>();

  useEffect(() => {
    const onTempVonageEvent = (remoteTrack: VCTrack) => {
      setRemoteTracks([...remoteTracks, remoteTrack]);
    };

    room.on('trackSubscribed', onTempVonageEvent);

    return () => {
      room.off('trackSubscribed', onTempVonageEvent);
    };
  }, [room, setRemoteTracks]);

  const saveInputsToLocalStorage = (event: React.SyntheticEvent<HTMLFormElement>) => {
    const formData = new FormData(event.currentTarget);
    const { sessionId, token } = Object.fromEntries(formData) as { sessionId: string, token: string };
    localStorage.setItem(LocalStorageSessionIdKey, sessionId);
    localStorage.setItem(LocalStorageTokenKey, token);
  };

  useEffect(() => {
    const assignDevices = (devices: MediaDeviceInfo[]) => {
      const mics: MediaDeviceInfo[] = [];
      const cameras: MediaDeviceInfo[] = [];
      devices.forEach(device => {
        switch (device.kind) {
          case 'audioinput': mics.push(device); break;
          case 'videoinput': cameras.push(device); break;
        }
      });
      setMicDevices(mics);
      setCameraDevices(cameras);
    };

    if (videoTrack) {
      navigator.mediaDevices.enumerateDevices().then(assignDevices);
    }
  }, [videoTrack]);

  /**
   * If I expect to toggle the camera enabled state on the localTrack itself, there are two problems.
   * * I need to update Twilio's solution to always have a camera track even when there isn't one.
   * * * I can do this by using Twilio's `LocalVideoTrack.enable(boolean)` to match Vonage's behavior.
   * * I would have to pass the Publisher instance into the RemoteVonageTrack instances.
   *
   * Or I can just have the VCRoom object manage this via a public method.
   *
   * Ultimately, holding onto a camera is bad. It shows the light and ties up the hardware. But that's
   * how every single application manages microphones. Ugh.
   */
  const toggleCamera = async () => {
    if (cameraEnabled) {
      room.stopCamera();
      videoTrack?.mediaStreamTrack.stop();
      setVideoTrack(undefined);
      setCameraEnabled(false);
    } else {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: cameraDeviceId } });
      const track = stream.getVideoTracks()[0];
      const localVideoTrack = await room.startCamera(track);
      setVideoTrack(localVideoTrack);
      setCameraEnabled(true);
    }
  };

  const toggleMic = () => {
    const enableMic = !micEnabled;
    room.enableMic(enableMic);
    setMicEnabled(enableMic);
  };

  const toggleScreenshare = async () => {
    if (screen) {
      room.stopScreenShare();
      setScreen(undefined);
    } else {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: {
          frameRate: 10,
          height: 1080,
          width: 1920,
        },
      });
      const screenTrack = await room.startScreenshare(stream);
      setScreen(screenTrack);
    }
  };

  const changeCamera = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCameraDeviceId(e.target.value);
    videoTrack?.mediaStreamTrack.stop();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: e.target.value } });
    const track = stream.getVideoTracks()[0];
    const localVideoTrack = await room.changeCamera(track);
    setVideoTrack(localVideoTrack);
  };

  const changeMic = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    setMicDeviceId(e.target.value);
    const localAudioTrack = await room.changeMic(e.target.value);
    setAudioTrack(localAudioTrack);
  };

  const acquireHardware = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    const { audio, video } = await room.createLocalTracks(stream);
    setAudioTrack(audio);
    setVideoTrack(video);
  };

  const onSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveInputsToLocalStorage(event);
    if (roomName && roomToken) {
      await room.connect({ roomName, roomToken });
      setConnected(true);
    }
  };

  const disconnect = () => {
    room.disconnect();
    setConnected(false);
    setAudioTrack(undefined);
    setVideoTrack(undefined);
  };

  return (
    <div className="App">
      <header className="App-header">
        {!connected &&
          <div>
            <button onClick={acquireHardware}>Acquire Hardware</button>
            <form onSubmit={onSubmit}>
              <input name="sessionId" placeholder="Session ID" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
              <input name="token" placeholder="Token" value={roomToken} onChange={(e) => setRoomToken(e.target.value)} />
              <input type="submit" disabled={!audioTrack || !videoTrack} value="Connect" />
            </form>
          </div>
        }
        {connected &&
          <button onClick={disconnect}>Disconnect</button>
        }
        <div>
          {/* {!!videoTrack && */}
            <button onClick={toggleCamera}>{`${cameraEnabled ? 'Disable' : 'Enable'} Camera`}</button>
          {/* } */}
          {!!audioTrack &&
            <button onClick={toggleMic}>{`${micEnabled ? 'Disable' : 'Enable'} mic`}</button>
          }
          {connected &&
            <button onClick={toggleScreenshare}>{`${!!screen ? 'Stop' : 'Start'} screenshare`}</button>
          }
          {videoTrack && cameraEnabled && cameraDevices.length > 0 &&
            <select onChange={changeCamera} value={cameraDeviceId}>
              {cameraDevices.map(camera => <option key={camera.deviceId} value={camera.deviceId}>{camera.label}</option>)}
            </select>
          }
          {audioTrack && micEnabled && micDevices.length > 0 &&
            <select onChange={changeMic} value={micDeviceId}>
              {micDevices.map(mic => <option key={mic.deviceId} value={mic.deviceId}>{mic.label}</option>)}
            </select>
          }
        </div>
        { !!(audioTrack && videoTrack) &&
          <Video mirror muted track={videoTrack} />
        }
        {!!screen &&
          <Video muted track={screen} />
        }
        {
          remoteTracks.map((remoteTrack, i) => {
            return <Video key={i} track={remoteTrack} />;
          })
        }
      </header>
    </div>
  );
}