'use client';

import React, { useEffect, useRef } from 'react';

interface AudioStreamProps {
  stream: MediaStream;
}

const AudioStream: React.FC<AudioStreamProps> = ({ stream }) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline />;
};

export default AudioStream;
