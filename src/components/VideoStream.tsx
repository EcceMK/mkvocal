import React, { useEffect, useRef } from 'react';

interface VideoStreamProps {
  stream: MediaStream | null;
  username: string;
  isLocal?: boolean;
  isSpeaking?: boolean;
  muted?: boolean;
}

const VideoStream: React.FC<VideoStreamProps> = ({ stream, username, isLocal, isSpeaking, muted }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const hasVideo = stream && stream.getVideoTracks().some(t => t.enabled);

  return (
    <div className={`relative rounded-lg overflow-hidden bg-[#1e1f22] aspect-video flex items-center justify-center border-2 transition-all duration-300 ${isSpeaking ? 'border-[#23a559] scale-[1.02] shadow-[0_0_15px_rgba(35,165,89,0.4)]' : 'border-transparent'}`}>
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal || muted}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white uppercase bg-[#5865f2]`}>
            {username[0]}
          </div>
          <span className="text-gray-400 font-medium text-sm">{username}</span>
        </div>
      )}
      <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 backdrop-blur-sm rounded text-[11px] font-bold text-white flex items-center gap-2">
        {isSpeaking && <span className="w-2 h-2 rounded-full bg-[#23a559] animate-pulse" />}
        {username} {isLocal && '(Tu)'}
      </div>
    </div>
  );
};

export default VideoStream;
