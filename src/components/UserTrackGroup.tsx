import { AudioTrack, Room, SignalEventTypes, VideoTrack } from "../video-core/abstract/VideoCore";
import Video from "./Video";

export interface TrackGroup {
  identity: string;
  kind: 'default' | 'screen';
  audio?: AudioTrack;
  video?: VideoTrack;
}

interface TrackGroupProps {
  room: Room;
  group: TrackGroup;
  mirror?: boolean;
  local?: boolean;
}

export const UserTrackGroup = ({ room, group }: TrackGroupProps) => {
  const { identity, kind, audio, video } = group;
  const local = identity === room.identity;
  const mirror = local && kind === 'default';

  const forceMute = (identity: string) => {
    room.signal({
      type: SignalEventTypes.ForceMute,
      to: identity,
      from: room.identity,
    });
  };

  return (
    <div className='Video' key={identity}>
      <div className='TrackGroupText'>
        <p className='Name'>{`Id: ${identity}`}</p>
          {audio &&
            <div>
              <p className='AudioState'>{`Mic: ${audio.isEnabled ? 'on' : 'off'}`}</p>
              {!local &&
                <button disabled={!audio.isEnabled} onClick={() => forceMute(identity)}>Mute</button>
              }
            </div>
          }
        <p className='Kind'>{`Kind: ${kind}`}</p>
      </div>
      {video &&
        <Video mirror={mirror} key={video.id} track={video} />
      }
    </div>
  )
};
