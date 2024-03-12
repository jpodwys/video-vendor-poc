import Daily, { DailyEventObjectParticipant, DailyEventObjectParticipantLeft, DailyEventObjectTrack } from "@daily-co/daily-js";
import { ChangeEvent, useCallback, useEffect, useState } from "react";
import Video from "./Video";

// @ts-ignore
const call = window.call = Daily.createCallObject({
  subscribeToTracksAutomatically: true,
});

const CAMERA_NAME = 'camera';
const SCREEN_VIDEO_NAME = 'screenVideo';
const LOCAL_STORAGE_CAMERA_DEVICE_KEY = 'cameraDeviceId';

type RemoteParticipant = {
  id: string;
  [TrackNames.audio]?: MediaStreamTrack;
  [TrackNames.video]?: MediaStreamTrack;
  [TrackNames.screenAudio]?: MediaStreamTrack;
  [TrackNames.screenVideo]?: MediaStreamTrack;
}

type RemoteParticipants = Map<string, RemoteParticipant>;

enum TrackNames {
  audio = 'audio',
  video = 'video',
  screenAudio = 'screenAudio',
  screenVideo = 'screenVideo',
}

export default function DailyApp() {
  const [videoTrack, setVideoTrack] = useState<MediaStreamTrack | undefined>();
  const [screenVideoTrack, setScreenVideoTrack] = useState<MediaStreamTrack | undefined>();
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipants>(new Map());
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setVideoInputs(videoDevices);
    });
  }, []);

  const onJoinedMeeting = () => console.log('Joined Meeting');

  const onParticipantJoinOrUpdated = (event: DailyEventObjectParticipant | undefined) => {
    if (event) {
      const { participant } = event;
      if (participant && !participant.local) {
        const remoteParticipant: RemoteParticipant = {
          id: participant.user_id,
        };
        const tracks = participant.tracks;
        for (const trackName in tracks) {
          const remoteTrack = tracks[trackName];
          if (remoteTrack && remoteTrack.persistentTrack) {
            remoteParticipant[trackName as TrackNames] = remoteTrack.persistentTrack;
          }
        }
        remoteParticipants.set(participant.user_id, remoteParticipant);
        setRemoteParticipants(new Map(remoteParticipants));
      }
    }
  };

  const onParticipantLeft = (event: DailyEventObjectParticipantLeft | undefined) => {
    if (event) {
      const participantId = event.participant.user_id;
      remoteParticipants.delete(participantId);
      setRemoteParticipants(new Map(remoteParticipants));
    }
  };

  const attachListeners = () => {
    call.on('joined-meeting', onJoinedMeeting)
      .on('participant-joined', onParticipantJoinOrUpdated)
      .on('participant-updated', onParticipantJoinOrUpdated)
      .on('participant-left', onParticipantLeft);
  };

  const acquireVideo = async (deviceId: string = ''): Promise<MediaStreamTrack> => {
    deviceId = deviceId || localStorage.getItem(LOCAL_STORAGE_CAMERA_DEVICE_KEY) || '';
    const videoConstraints = deviceId
      ? { deviceId }
      : true;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false,
    });
    const track = stream.getVideoTracks()[0];
    setVideoTrack(track);
    return track;
  }

  const publishVideo = (track: MediaStreamTrack | undefined) => {
    if (track) {
      call.startCustomTrack({
        track,
        trackName: CAMERA_NAME,
      })
    }
  };

  const joinRoom = useCallback(async () => {
    attachListeners();
    await call.join({
      url: 'YOUR MEETING URL HERE',
    });
    /**
     * This setTimeout is necessary because Daily appears to be incapable of
     * publishing a customTrack immediately after calling `await call.join();`
     */
    setTimeout(() => publishVideo(videoTrack), 1000);
  }, [videoTrack]);

  const toggleCamera = async () => {
    if (videoTrack) {
      call.stopCustomTrack(CAMERA_NAME);
      videoTrack.stop();
      setVideoTrack(undefined);
    } else {
      const video = await acquireVideo();
      publishVideo(video);
    }
  };

  const onSelectCamera = useCallback(async (event: ChangeEvent<HTMLSelectElement>) => {
    event.preventDefault();
    if (videoTrack) {
      call.stopCustomTrack(CAMERA_NAME);
      videoTrack.stop();
      setVideoTrack(undefined);
    }
    const deviceId = event.currentTarget.value;
    const video = await acquireVideo(deviceId);
    publishVideo(video);
    localStorage.setItem(LOCAL_STORAGE_CAMERA_DEVICE_KEY, deviceId);
  }, [videoTrack]);

  const toggleScreenshare = useCallback(async () => {
    if (screenVideoTrack) {
      call.stopCustomTrack(SCREEN_VIDEO_NAME);
      screenVideoTrack.stop();
      setScreenVideoTrack(undefined);
    } else {
      const stream = await navigator.mediaDevices.getDisplayMedia();
      const screenVideo = stream.getVideoTracks()[0];
      call.startCustomTrack({
        track: screenVideo,
        trackName: SCREEN_VIDEO_NAME,
      });
      setScreenVideoTrack(screenVideo);
    }
  }, [screenVideoTrack]);

  const getTracksFromRemoteParticipants = useCallback((): MediaStreamTrack[] => {
    const remoteTracks: MediaStreamTrack[] = [];
    remoteParticipants.forEach(remoteParticipant => {
      Object.values(remoteParticipant).forEach(track => {
        if (track instanceof MediaStreamTrack)
        remoteTracks.push(track)
      });
    });
    return remoteTracks;
  }, [remoteParticipants]);

  return (
    <div className="App">
      <header className="App-header">
        <div>
          <button onClick={() => acquireVideo()}>Acquire Hardware</button>
          <button onClick={toggleCamera}>Toggle Camera</button>
          <button onClick={joinRoom}>Join Room</button>
          <select onChange={onSelectCamera}>
            {videoInputs.map(videoInput => {
              return <option key={videoInput.deviceId} value={videoInput.deviceId}>{videoInput.label}</option>
            })}
          </select>
          <button onClick={toggleScreenshare}>Toggle Screenshare</button>
        </div>
        {!!videoTrack &&
          <Video muted track={videoTrack} />
        }
        {getTracksFromRemoteParticipants().map((remoteTrack, i) => {
          return <Video key={i} track={remoteTrack} />;
        })}
      </header>
    </div>
  );
}
