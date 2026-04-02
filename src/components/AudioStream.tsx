'use client';

import React, { useEffect, useRef } from 'react';

interface AudioStreamProps {
  stream: MediaStream;
  volume?: number;
  muted?: boolean;
}

const AudioStream: React.FC<AudioStreamProps> = ({ stream, volume = 1, muted = false }) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = muted;
    }
  }, [volume, muted]);

  return <audio ref={audioRef} autoPlay playsInline />;
};

export default AudioStream;
