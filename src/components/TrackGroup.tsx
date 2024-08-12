import { AudioTrack, VideoTrack } from "../video-core/abstract/VideoCore";
import Video from "./Video";

export interface TrackGroup {
  identity: string;
  kind: 'default' | 'screen';
  audio?: AudioTrack;
  video?: VideoTrack;
}

interface TrackGroupProps {
  group: TrackGroup;
  mirror?: boolean;
}

export const UserTrackGroup = ({ group, mirror = false }: TrackGroupProps) => {
  const { identity, kind, audio, video } = group;
  return (
    <div className='Video' key={identity}>
      <div className='TrackGroupText'>
        <p className='Name'>{`Id: ${identity}`}</p>
        {audio &&
          <p className='AudioState'>{`Mic: ${audio?.isEnabled ? 'on' : 'off'}`}</p>
        }
        <p className='Kind'>{`Kind: ${kind}`}</p>
      </div>
      {video &&
        <Video mirror={mirror} key={video.id} track={video} />
      }
    </div>
  )
};
