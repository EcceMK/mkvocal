import React, { useState, useRef, useEffect } from 'react';

interface FloatingVideoProps {
  stream: MediaStream | null;
  username: string;
  isLocal?: boolean;
  isSpeaking?: boolean;
  onClose: () => void;
  initialX: number;
  initialY: number;
}

const FloatingVideo: React.FC<FloatingVideoProps> = ({ 
  stream, 
  username, 
  isLocal, 
  isSpeaking, 
  onClose,
  initialX,
  initialY
}) => {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.close-btn')) return;
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPos({
          x: e.clientX - dragStartPos.current.x,
          y: e.clientY - dragStartPos.current.y
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const hasVideo = stream && stream.getVideoTracks().some(t => t.enabled);

  return (
    <div 
      className={`fixed z-50 rounded-lg overflow-hidden bg-[#1e1f22] border-2 transition-[border-color,box-shadow,transform] duration-300 shadow-2xl flex flex-col ${isSpeaking ? 'border-[#23a559] scale-[1.02] shadow-[0_0_20px_rgba(35,165,89,0.5)]' : 'border-[#1e1f22]'} ${isDragging ? 'cursor-grabbing select-none' : ''}`}
      style={{ 
        left: `${pos.x}px`, 
        top: `${pos.y}px`,
        width: '320px',
        minWidth: '200px',
        minHeight: '150px',
        resize: 'both',
      }}
    >
      {/* Header / Drag Bar */}
      <div 
        onMouseDown={handleMouseDown}
        className="h-8 bg-[#2b2d31] flex items-center justify-between px-2 cursor-grab active:cursor-grabbing shrink-0"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-[#23a559] animate-pulse' : 'bg-gray-500'}`} />
          <span className="text-[11px] font-bold text-gray-300 truncate tracking-wide">{username} {isLocal && '(Tu)'}</span>
        </div>
        <button 
          onClick={onClose}
          className="close-btn p-1 hover:bg-[#fa777a] hover:text-white text-gray-400 rounded transition-colors group"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Video Content */}
      <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden aspect-video">
        {hasVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white uppercase bg-[#5865f2]">
              {username[0]}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FloatingVideo;
