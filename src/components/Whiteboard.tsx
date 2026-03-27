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
  onSendToChat?: (dataUrl: string) => void;
}

const Whiteboard: React.FC<WhiteboardProps> = ({ userId, onSendToChat }) => {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [allPaths, setAllPaths] = useState<Path[]>([]);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [tool, setTool] = useState<'pencil' | 'eraser'>('pencil');
  const [color, setColor] = useState('#5865f2');
  const [lineWidth, setLineWidth] = useState(3);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [bgImageObj, setBgImageObj] = useState<HTMLImageElement | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof document !== 'undefined' && !offCanvasRef.current) {
      offCanvasRef.current = document.createElement('canvas');
      offCanvasRef.current.width = 1600;
      offCanvasRef.current.height = 1000;
    }
  }, []);

  useEffect(() => {
    socket.on('whiteboard-draw', (data) => {
      setAllPaths(prev => {
        if (data.isNew) {
          return [
            ...prev,
            {
              points: [data.point],
              color: data.color || '#5865f2',
              width: data.width || 3,
              tool: data.tool || 'pencil',
              userId: data.socketId
            }
          ];
        } else {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].userId === data.socketId) {
              next[i] = { ...next[i], points: [...next[i].points, data.point] };
              break;
            }
          }
          return next;
        }
      });
    });

    socket.on('whiteboard-clear', ({ socketId }) => {
      setAllPaths(prev => prev.filter(p => p.userId !== socketId));
    });

    socket.on('whiteboard-history', (history) => {
      setAllPaths(history);
    });

    socket.on('whiteboard-bg', (bg) => {
      setBackgroundImage(bg);
    });

    socket.emit('get-whiteboard-history');

    return () => {
      socket.off('whiteboard-draw');
      socket.off('whiteboard-clear');
      socket.off('whiteboard-history');
      socket.off('whiteboard-bg');
    };
  }, []);

  useEffect(() => {
    if (backgroundImage) {
      const img = new Image();
      img.onload = () => setBgImageObj(img);
      img.src = backgroundImage;
    } else {
      setBgImageObj(null);
    }
  }, [backgroundImage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (bgImageObj) {
      const isHorizontal = bgImageObj.width >= bgImageObj.height;
      let targetWidth, targetHeight;
      if (isHorizontal) {
        targetWidth = canvas.width;
        targetHeight = bgImageObj.height * (canvas.width / bgImageObj.width);
      } else {
        targetHeight = canvas.height;
        targetWidth = bgImageObj.width * (canvas.height / bgImageObj.height);
      }
      const offsetX = (canvas.width - targetWidth) / 2;
      const offsetY = (canvas.height - targetHeight) / 2;
      ctx.drawImage(bgImageObj, offsetX, offsetY, targetWidth, targetHeight);
    }

    const offCanvas = offCanvasRef.current;
    if (offCanvas) {
      const offCtx = offCanvas.getContext('2d');
      if (offCtx) {
        offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);

        const renderPaths = (paths: Path[]) => {
          paths.forEach(path => {
            if (!path.points || path.points.length < 2) return;

            offCtx.beginPath();
            offCtx.lineCap = 'round';
            offCtx.lineJoin = 'round';
            offCtx.lineWidth = path.width;

            if (path.tool === 'eraser') {
              offCtx.globalCompositeOperation = 'destination-out';
              offCtx.strokeStyle = 'rgba(0,0,0,1)';
            } else {
              offCtx.globalCompositeOperation = 'source-over';
              offCtx.strokeStyle = path.color;
            }

            offCtx.moveTo(path.points[0].x, path.points[0].y);
            for (let i = 1; i < path.points.length; i++) {
              offCtx.lineTo(path.points[i].x, path.points[i].y);
            }
            offCtx.stroke();
          });
          offCtx.globalCompositeOperation = 'source-over'; // reset
        };

        renderPaths(allPaths);

        if (currentPath.length > 0) {
          renderPaths([{
            points: currentPath,
            color,
            width: lineWidth,
            tool,
            userId: 'local'
          }]);
        }

        ctx.drawImage(offCanvas, 0, 0);
      }
    }

  }, [allPaths, currentPath, color, lineWidth, tool, bgImageObj]);

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
    setAllPaths(prev => [
      ...prev,
      {
        points: currentPath,
        color,
        width: lineWidth,
        tool,
        userId: 'local'
      }
    ]);
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
    setAllPaths(prev => prev.filter(p => p.userId !== 'local'));
    socket.emit('whiteboard-clear');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert(t('voice_room.whiteboard.only_images_allowed') || 'Formato non supportato. Carica solo immagini.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setBackgroundImage(result);
      socket.emit('whiteboard-bg', result);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearBackground = () => {
    setBackgroundImage(null);
    socket.emit('whiteboard-clear-bg');
  };

  const downloadCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tCtx = tempCanvas.getContext('2d');
    if (!tCtx) return;

    tCtx.fillStyle = '#2b2d31';
    tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tCtx.drawImage(canvas, 0, 0);

    const dataUrl = tempCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `whiteboard-${new Date().getTime()}.png`;
    link.href = dataUrl;
    link.click();
  };

  const sendToChat = () => {
    if (!onSendToChat) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tCtx = tempCanvas.getContext('2d');
    if (!tCtx) return;

    tCtx.fillStyle = '#2b2d31';
    tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tCtx.drawImage(canvas, 0, 0);

    const dataUrl = tempCanvas.toDataURL('image/png');
    onSendToChat(dataUrl);

    setToastMsg(t('voice_room.whiteboard.sent_to_chat_success') || 'Lavagna inviata in chat con successo!');
    setTimeout(() => setToastMsg(null), 3000);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#2b2d31] rounded-lg overflow-hidden border border-[#1e1f22]">
      <div className="h-12 bg-[#232428] border-b border-[#1e1f22] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex bg-[#1e1f22] rounded-lg p-1">
            <button
              onClick={() => setTool('pencil')}
              className={`p-1.5 rounded transition-all cursor-pointer ${tool === 'pencil' ? 'bg-[#5865f2] text-white' : 'text-gray-400 hover:text-white'}`}
              title={t('voice_room.whiteboard.pencil')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`p-1.5 rounded transition-all cursor-pointer ${tool === 'eraser' ? 'bg-[#da373c] text-white' : 'text-gray-400 hover:text-white'}`}
              title={t('voice_room.whiteboard.eraser')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>

          <div className="flex items-center ml-2 border-l border-[#1e1f22] pl-2 gap-1">
            <input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleImageUpload} 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="text-[10px] font-bold text-gray-400 hover:text-white transition-colors uppercase px-2 py-2 bg-[#1e1f22] rounded hover:bg-[#35373c] flex items-center gap-1 cursor-pointer"
              title={t('voice_room.whiteboard.upload_bg') || 'Carica Sfondo'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2-2v12a2 2 0 002 2z" /></svg>
            </button>
            {bgImageObj && (
              <button
                onClick={clearBackground}
                className="text-[10px] font-bold text-gray-400 hover:text-[#f23f42] transition-colors uppercase px-2 py-1 bg-[#1e1f22] rounded hover:bg-[#35373c] cursor-pointer"
                title={t('voice_room.whiteboard.clear_bg') || 'Rimuovi Sfondo'}
              >
                X
              </button>
            )}
          </div>

          {tool === 'pencil' && (
            <div className="flex gap-1.5">
              {['#5865f2', '#f23f42', '#23a559', '#f9a8d4', '#fee75c', '#ffffff'].map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer hover:scale-110 ${color === c ? 'border-white' : 'border-transparent'}`}
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

        <div className="flex items-center gap-2">
          <button
            onClick={downloadCanvas}
            className="text-[10px] font-bold text-gray-400 hover:text-white transition-colors uppercase px-2 py-2 bg-[#1e1f22] rounded hover:bg-[#35373c] flex items-center gap-1 cursor-pointer "
            title={t('voice_room.whiteboard.download')}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4-4V4" /></svg>
          </button>
          <button
            onClick={sendToChat}
            className="text-[10px] font-bold text-gray-400 hover:text-[#5865f2] transition-colors uppercase px-2 py-2 bg-[#1e1f22] rounded hover:bg-[#35373c] flex items-center gap-1 cursor-pointer "
            title={t('voice_room.whiteboard.send_to_chat') || "Invia in Chat"}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
          <button
            onClick={clearOwn}
            className="text-[10px] font-bold text-gray-400 hover:text-[#f23f42] transition-colors uppercase tracking-widest px-2 py-2 bg-[#1e1f22] rounded hover:bg-[#35373c] cursor-pointer "
          >
            {t('voice_room.whiteboard.clear_own')}
          </button>
        </div>
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
        {toastMsg && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#23a559] text-white px-6 py-2 rounded-full font-bold shadow-2xl text-sm z-50 animate-in fade-in slide-in-from-bottom-5">
            {toastMsg}
          </div>
        )}
      </div>
    </div>
  );
};

export default Whiteboard;
