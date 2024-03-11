import { useEffect, useRef, useState } from "react";

interface VideoProps {
  track: MediaStreamTrack;
  muted?: boolean;
}

const Video = ({ track, ...props }: VideoProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream>(new MediaStream([track]));

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = mediaStream;
    }
  }, [mediaStream]);

  return <video autoPlay ref={videoRef} {...props} />
};

export default Video;
