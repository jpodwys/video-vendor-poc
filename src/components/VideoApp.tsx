import { useEffect, useState } from 'react';
import '../App.css';
import Video from './Video';
import { VCRoom, VCTrack } from '../video-core/abstract/VideoCore';

interface VideoAppProps {
  room: VCRoom;
  roomName: string;
  roomToken: string;
}

export default function VideoApp({ room, roomName, roomToken }: VideoAppProps) {
  const [connected, setConnected] = useState(false);
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

  const connect = async () => {
    await room.connect({ roomName, roomToken });
    setConnected(true);
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
            <button onClick={connect} disabled={!audioTrack || !videoTrack}>Connect</button>
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