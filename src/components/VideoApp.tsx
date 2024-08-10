import { useEffect, useState } from 'react';
import '../App.css';
import Video from './Video';
import { Participant, Room, AudioTrack, VideoTrack } from '../video-core/abstract/VideoCore';

interface VideoAppProps {
  room: Room;
  roomName: string;
  roomToken: string;
}

export default function VideoApp({ room, roomName, roomToken }: VideoAppProps) {
  const [connected, setConnected] = useState(false);
  const [audioTrack, setAudioTrack] = useState<AudioTrack | undefined>();
  const [videoTrack, setVideoTrack] = useState<VideoTrack | undefined>();
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, Participant>>(new Map());
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [micDeviceId, setMicDeviceId] = useState('');
  const [cameraDeviceId, setCameraDeviceId] = useState('');
  const [screen, setScreen] = useState<VideoTrack | undefined>();

  const updateParticipant = (remoteParticipant: Participant) => {
    remoteParticipants.set(remoteParticipant.identity, remoteParticipant);
    setRemoteParticipants(new Map(remoteParticipants));
  };

  /**
   * These event handlers all apply a brute-force approach that simply overwrites
   * the applicable remoteParticipant. I could collapse all of these into a single
   * event schema and handler, but I believe I'm going to need all of this additional
   * data when I port this back into the main application.
   */
  useEffect(() => {
    const onParticipantConnected = (remoteParticipant: Participant) => {
      updateParticipant(remoteParticipant);
    };

    const onParticipantDisconnected = (remoteParticipant: Participant) => {
      remoteParticipants.delete(remoteParticipant.identity);
      setRemoteParticipants(new Map(remoteParticipants));
    };

    const onTrackSubscribed = (remoteTrack: AudioTrack | VideoTrack, remoteParticipant: Participant) => {
      updateParticipant(remoteParticipant);
    };

    const onTrackUnsubscribed = (remoteTrack: AudioTrack | VideoTrack, remoteParticipant: Participant) => {
      updateParticipant(remoteParticipant);
    };

    const onTrackUnpublished = (remoteTrack: AudioTrack | VideoTrack, remoteParticipant: Participant) => {
      updateParticipant(remoteParticipant);
    };

    room.on('participantConnected', onParticipantConnected)
    room.on('participantDisconnected', onParticipantDisconnected);
    room.on('trackSubscribed', onTrackSubscribed);
    room.on('trackUnsubscribed', onTrackUnsubscribed)
    room.on('trackUnpublished', onTrackUnpublished);

    return () => {
      room.off('trackSubscribed', onTrackSubscribed);
    };
  }, [room, remoteParticipants, setRemoteParticipants]);

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
      videoTrack?.stop();
      room.stopCamera();
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
      screen?.stop();
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
    videoTrack?.stop();
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

  const participants = Array.from(remoteParticipants.values());
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
          participants.map((participant) => {
            return (
              <div key={participant.identity}>
                <p>{participant.identity}</p>
                {
                  [participant.camera, participant.screen].map((track) => {
                    if (track) {
                      return <Video key={track.id} track={track} />;
                    }
                  })
                }
              </div>
            )
          })
        }
      </header>
    </div>
  );
}