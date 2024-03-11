import { useEffect, useRef } from "react";

interface VideoProps {
  srcObject: MediaStream;
  muted?: boolean;
}

const Video = ({ srcObject, ...props }: VideoProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = srcObject;
    }
  }, [srcObject]);

  return <video autoPlay ref={videoRef} {...props} />
};

export default Video;
