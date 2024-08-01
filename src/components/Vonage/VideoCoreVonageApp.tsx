import { useEffect, useState } from 'react';
import '../../App.css';
import Video from '../Video';
import { VonageRoom } from '../../video-core/adapters/VideoCoreVonage';
import { VCTrack } from '../../video-core/abstract/VideoCore';

const LocalStorageSessionIdKey = 'OTSessionId';
const LocalStorageTokenKey = 'OTToken';

export default function VideoCoreVonageApp() {
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

  useEffect(() => {
    const onTempVonageEvent = (remoteTrack: VCTrack) => {
      setRemoteTracks([...remoteTracks, remoteTrack]);
    };
    // const onTempVonageTrackEvent = (localVideoTrack: VCTrack) => {
    //   console.log('NEW LOCAL VIDEO TRACK', localVideoTrack);
    //   setVideoTrack(localVideoTrack);
    // };

    room.on('trackSubscribed', onTempVonageEvent);
    // room.on('temporaryVonageUpdatedLocalVideoTrackEvent', onTempVonageTrackEvent);

    return () => {
      room.off('trackSubscribed', onTempVonageEvent);
      // room.off('temporaryVonageUpdatedLocalVideoTrackEvent', onTempVonageTrackEvent);
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
    const enableCamera = !cameraEnabled;
    const localVideoTrack = await room.enableCamera(enableCamera);
    setCameraEnabled(enableCamera);
    if (localVideoTrack) {
      setVideoTrack(localVideoTrack);
    }
  };

  const toggleMic = () => {
    const enableMic = !micEnabled;
    room.enableMic(enableMic);
    setMicEnabled(enableMic);
  };

  // const changeCamera = async (e: React.ChangeEvent<HTMLSelectElement>) => {
  //   setCameraDeviceId(e.target.value);
  //   const localVideoTrack = await room.changeCamera(e.target.value);
  //   setVideoTrack(localVideoTrack);
  // };

  const changeCamera = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCameraDeviceId(e.target.value);
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
          {!!videoTrack &&
            <button onClick={toggleCamera}>{`${cameraEnabled ? 'Disable' : 'Enable'} Camera`}</button>
          }
          {!!audioTrack &&
            <button onClick={toggleMic}>{`${micEnabled ? 'Disable' : 'Enable'} mic`}</button>
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
        {
          remoteTracks.map((remoteTrack, i) => {
            return <Video key={i} track={remoteTrack} />;
          })
        }
      </header>
    </div>
  );
}