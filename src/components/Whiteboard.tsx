import React, { useEffect, useRef, useState } from 'react';
import socket from '../lib/socket';
import { useI18n } from '../lib/i18n';

interface Point {
  x: number;
  y: number;
}

interface Path {
  points: Point[];
  color: string;
  width: number;
  tool: 'pencil' | 'eraser';
  userId: string;
}

interface WhiteboardProps {
  userId: string;
}

const Whiteboard: React.FC<WhiteboardProps> = ({ userId }) => {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [allPaths, setAllPaths] = useState<{ [userId: string]: Path[] }>({});
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [tool, setTool] = useState<'pencil' | 'eraser'>('pencil');
  const [color, setColor] = useState('#5865f2');
  const [lineWidth, setLineWidth] = useState(3);

  // Buffer canvases for each user to allow selective erasing
  const userBuffers = useRef<{ [userId: string]: HTMLCanvasElement }>({});

  useEffect(() => {
    socket.on('whiteboard-draw', ({ socketId, ...data }) => {
      setAllPaths(prev => {
        const userPaths = prev[socketId] || [];
        if (data.isNew) {
          return { ...prev, [socketId]: [...userPaths, { ...data, userId: socketId }] };
        } else {
          const lastPath = userPaths[userPaths.length - 1];
          if (lastPath) {
            const updatedPath = { ...lastPath, points: [...lastPath.points, data.point] };
            const updatedUserPaths = [...userPaths];
            updatedUserPaths[updatedUserPaths.length - 1] = updatedPath;
            return { ...prev, [socketId]: updatedUserPaths };
          } else {
            // Fallback if isNew was missed
            return { ...prev, [socketId]: [{
              points: [data.point],
              color: data.color || '#5865f2',
              width: data.width || 3,
              tool: data.tool || 'pencil',
              userId: socketId
            }] };
          }
        }
      });
    });

    socket.on('whiteboard-clear', ({ socketId }) => {
      setAllPaths(prev => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
    });

    return () => {
      socket.off('whiteboard-draw');
      socket.off('whiteboard-clear');
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const renderUserPaths = (uId: string, paths: Path[]) => {
      if (!userBuffers.current[uId]) {
        userBuffers.current[uId] = document.createElement('canvas');
        userBuffers.current[uId].width = canvas.width;
        userBuffers.current[uId].height = canvas.height;
      }
      const bCanvas = userBuffers.current[uId];
      const bCtx = bCanvas.getContext('2d');
      if (!bCtx) return;

      bCtx.clearRect(0, 0, bCanvas.width, bCanvas.height);
      
      paths.forEach(path => {
        if (!path.points || path.points.length < 2) return;
        
        bCtx.beginPath();
        bCtx.lineCap = 'round';
        bCtx.lineJoin = 'round';
        bCtx.lineWidth = path.width;
        
        if (path.tool === 'eraser') {
          bCtx.globalCompositeOperation = 'destination-out';
          bCtx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
          bCtx.globalCompositeOperation = 'source-over';
          bCtx.strokeStyle = path.color;
        }

        bCtx.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i++) {
          bCtx.lineTo(path.points[i].x, path.points[i].y);
        }
        bCtx.stroke();
      });

      ctx.drawImage(bCanvas, 0, 0);
    };

    Object.entries(allPaths).forEach(([uId, paths]) => {
      if (uId !== 'local') renderUserPaths(uId, paths);
    });

    const localPaths = allPaths['local'] || [];
    renderUserPaths('local', [...localPaths, ...(currentPath.length > 0 ? [{
      points: currentPath,
      color,
      width: lineWidth,
      tool,
      userId: 'local'
    }] : [])] as Path[]);

  }, [allPaths, currentPath, color, lineWidth, tool]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const pos = getPos(e);
    setCurrentPath([pos]);
    
    socket.emit('whiteboard-draw', {
      point: pos,
      color,
      width: lineWidth,
      tool,
      isNew: true
    });
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const pos = getPos(e);
    setCurrentPath(prev => [...prev, pos]);
    
    socket.emit('whiteboard-draw', {
      point: pos,
      isNew: false
    });
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    setAllPaths(prev => ({
      ...prev,
      ['local']: [...(prev['local'] || []), {
        points: currentPath,
        color,
        width: lineWidth,
        tool,
        userId: 'local'
      }]
    }));
    setCurrentPath([]);
  };

  const getPos = (e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
    
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  };

  const clearOwn = () => {
    setAllPaths(prev => {
      const next = { ...prev };
      delete next['local'];
      return next;
    });
    socket.emit('whiteboard-clear');
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#2b2d31] rounded-lg overflow-hidden border border-[#1e1f22]">
      <div className="h-12 bg-[#232428] border-b border-[#1e1f22] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex bg-[#1e1f22] rounded-lg p-1">
            <button 
              onClick={() => setTool('pencil')}
              className={`p-1.5 rounded transition-all ${tool === 'pencil' ? 'bg-[#5865f2] text-white' : 'text-gray-400 hover:text-white'}`}
              title={t('voice_room.whiteboard.pencil')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            </button>
            <button 
              onClick={() => setTool('eraser')}
              className={`p-1.5 rounded transition-all ${tool === 'eraser' ? 'bg-[#da373c] text-white' : 'text-gray-400 hover:text-white'}`}
              title={t('voice_room.whiteboard.eraser')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>

          {tool === 'pencil' && (
            <div className="flex gap-1.5">
              {['#5865f2', '#f23f42', '#23a559', '#f9a8d4', '#fee75c', '#ffffff'].map(c => (
                <button 
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${color === c ? 'border-white' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 ml-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">{t('voice_room.whiteboard.size')}</span>
            <input 
              type="range" min="1" max="25" 
              value={lineWidth} 
              onChange={(e) => setLineWidth(parseInt(e.target.value))}
              className="w-20 h-1.5 bg-[#1e1f22] rounded-lg appearance-none cursor-pointer accent-[#5865f2]"
            />
            <span className="text-[10px] font-bold text-gray-400 w-4">{lineWidth}</span>
          </div>
        </div>

        <button 
          onClick={clearOwn}
          className="text-[10px] font-bold text-gray-400 hover:text-[#f23f42] transition-colors uppercase tracking-widest px-2 py-1 bg-[#1e1f22] rounded hover:bg-[#35373c]"
        >
          {t('voice_room.whiteboard.clear_own')}
        </button>
      </div>

      <div className="flex-1 relative cursor-crosshair overflow-hidden bg-[#2b2d31]">
        <canvas 
          ref={canvasRef}
          width={1600}
          height={1000}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="block w-full h-full"
          style={{ touchAction: 'none' }}
        />
      </div>
    </div>
  );
};

export default Whiteboard;
