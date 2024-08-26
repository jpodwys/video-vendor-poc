import { useEffect, useRef } from "react";
import { VideoTrack } from "../video-core/abstract/VideoCore";

interface VideoProps {
  track: VideoTrack;
  muted?: boolean;
  mirror?: boolean;
}

const Video = ({ track, mirror, ...props }: VideoProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) {
      return;
    }
    track.attach(el);
    return () => {
      track.detach();
    }
  }, [track]);

  return <video autoPlay playsInline ref={videoRef} {...props} style={{transform: mirror ? 'scaleX(-1)' : ''}}/>
};

export default Video;
