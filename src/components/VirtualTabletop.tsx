'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import socket from '../lib/socket';
import { useI18n } from '../lib/i18n';

interface Point { x: number; y: number; }

interface VTTPath {
  points: Point[];
  color: string;
  width: number;
  tool: 'pencil' | 'eraser' | 'line' | 'rect' | 'circle' | 'arrow';
  userId: string;
  id: string;
}

interface Token {
  id: string;
  x: number;
  y: number;
  size: number;
  imageUrl: string;
  label: string;
  userId: string;
}

interface Camera { x: number; y: number; zoom: number; }

interface VirtualTabletopProps {
  userId: string;
  onSendToChat?: (dataUrl: string) => void;
}

const CANVAS_W = 2000;
const CANVAS_H = 1400;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const DEFAULT_GRID_SIZE = 50;

const genId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 6);

type ToolType = 'pencil' | 'eraser' | 'line' | 'rect' | 'circle' | 'arrow' | 'select';

const ToolBtn = ({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) => (
  <button onClick={onClick} title={title}
    className={`p-1.5 rounded transition-all cursor-pointer ${active ? 'bg-[#5865f2] text-white' : 'text-gray-400 hover:text-white hover:bg-[#35373c]'}`}>
    {children}
  </button>
);

const VirtualTabletop: React.FC<VirtualTabletopProps> = ({ userId, onSendToChat }) => {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tokenInputRef = useRef<HTMLInputElement>(null);

  const [allPaths, setAllPaths] = useState<VTTPath[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [tool, setTool] = useState<ToolType>('pencil');
  const [color, setColor] = useState('#5865f2');
  const [lineWidth, setLineWidth] = useState(3);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [bgImageObj, setBgImageObj] = useState<HTMLImageElement | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [gridSize, setGridSize] = useState(DEFAULT_GRID_SIZE);
  const [renderTick, setRenderTick] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const isDrawingRef = useRef(false);
  const currentPathRef = useRef<Point[]>([]);
  const shapeStartRef = useRef<Point | null>(null);
  const currentPathIdRef = useRef<string>('');
  const toolRef = useRef<ToolType>(tool);
  const colorRef = useRef(color);
  const lineWidthRef = useRef(lineWidth);
  const cameraRef = useRef(camera);
  const tokensRef = useRef(tokens);

  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { lineWidthRef.current = lineWidth; }, [lineWidth]);
  useEffect(() => { cameraRef.current = camera; }, [camera]);
  useEffect(() => { tokensRef.current = tokens; }, [tokens]);

  const isPanningRef = useRef(false);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const cameraStartRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });

  const draggingTokenRef = useRef<string | null>(null);
  const tokenDragOffsetRef = useRef<Point>({ x: 0, y: 0 });

  const tokenImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [undoStack, setUndoStack] = useState<VTTPath[]>([]);
  const [redoStack, setRedoStack] = useState<VTTPath[]>([]);

  const isShapeTool = (t: string) => ['line', 'rect', 'circle', 'arrow'].includes(t);
  const forceRender = useCallback(() => setRenderTick(t => t + 1), []);

  // ---- Socket listeners ----
  useEffect(() => {
    socket.on('vtt-draw', (data: any) => {
      if (data.isNew) {
        setAllPaths(prev => [...prev, {
          points: [data.point], color: data.color || '#5865f2', width: data.width || 3,
          tool: data.tool || 'pencil', userId: data.socketId, id: data.id
        }]);
      } else {
        setAllPaths(prev => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].id === data.id) {
              next[i] = { ...next[i], points: [...next[i].points, data.point] };
              break;
            }
          }
          return next;
        });
      }
    });

    socket.on('vtt-shape', (data: any) => {
      setAllPaths(prev => [...prev, {
        points: [data.start, data.end], color: data.color, width: data.width,
        tool: data.tool, userId: data.socketId, id: data.id
      }]);
    });

    socket.on('vtt-clear', ({ socketId }: { socketId: string }) => {
      setAllPaths(prev => prev.filter(p => p.userId !== socketId));
    });

    socket.on('vtt-history', (history: VTTPath[]) => setAllPaths(history || []));
    socket.on('vtt-bg', (bg: string | null) => setBackgroundImage(bg));
    socket.on('vtt-undo', ({ pathId }: { pathId: string }) => {
      setAllPaths(prev => prev.filter(p => p.id !== pathId));
    });
    socket.on('vtt-redo', (pathData: VTTPath) => {
      setAllPaths(prev => [...prev, pathData]);
    });

    socket.on('vtt-tokens', (serverTokens: Token[]) => setTokens(serverTokens || []));
    socket.on('vtt-token-add', (token: Token) => {
      setTokens(prev => [...prev.filter(t => t.id !== token.id), token]);
    });
    socket.on('vtt-token-move', ({ id, x, y }: { id: string; x: number; y: number }) => {
      setTokens(prev => prev.map(tk => tk.id === id ? { ...tk, x, y } : tk));
    });
    socket.on('vtt-token-update', (token: Token) => {
      setTokens(prev => prev.map(tk => tk.id === token.id ? token : tk));
    });
    socket.on('vtt-token-remove', ({ id }: { id: string }) => {
      setTokens(prev => prev.filter(tk => tk.id !== id));
    });

    socket.emit('get-vtt-history');

    return () => {
      socket.off('vtt-draw'); socket.off('vtt-shape'); socket.off('vtt-clear');
      socket.off('vtt-history'); socket.off('vtt-bg'); socket.off('vtt-undo'); socket.off('vtt-redo');
      socket.off('vtt-tokens'); socket.off('vtt-token-add'); socket.off('vtt-token-move'); socket.off('vtt-token-update'); socket.off('vtt-token-remove');
    };
  }, []);

  // ---- Background image loading ----
  useEffect(() => {
    if (backgroundImage) {
      const img = new Image();
      img.onload = () => { setBgImageObj(img); forceRender(); };
      img.src = backgroundImage;
    } else {
      setBgImageObj(null);
    }
  }, [backgroundImage, forceRender]);

  // ---- Load token images ----
  useEffect(() => {
    tokens.forEach(tk => {
      if (!tokenImagesRef.current.has(tk.imageUrl)) {
        const img = new Image();
        img.onload = () => { tokenImagesRef.current.set(tk.imageUrl, img); forceRender(); };
        img.src = tk.imageUrl;
        tokenImagesRef.current.set(tk.imageUrl, img);
      }
    });
  }, [tokens, forceRender]);

  // ---- Canvas rendering with Ink Layer ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!inkCanvasRef.current) {
        inkCanvasRef.current = document.createElement('canvas');
    }
    const inkCanvas = inkCanvasRef.current;
    const inkCtx = inkCanvas.getContext('2d');
    if (!inkCtx) return;

    const ratio = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    
    if (canvas.width !== w * ratio || canvas.height !== h * ratio) {
        canvas.width = w * ratio;
        canvas.height = h * ratio;
        inkCanvas.width = canvas.width;
        inkCanvas.height = canvas.height;
    }

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1e1f22';
    ctx.fillRect(0, 0, w, h);

    ctx.setTransform(camera.zoom * ratio, 0, 0, camera.zoom * ratio, camera.x * ratio, camera.y * ratio);

    if (bgImageObj) {
      const imgScale = Math.min(CANVAS_W / bgImageObj.width, CANVAS_H / bgImageObj.height);
      const iw = bgImageObj.width * imgScale;
      const ih = bgImageObj.height * imgScale;
      ctx.drawImage(bgImageObj, (CANVAS_W - iw) / 2, (CANVAS_H - ih) / 2, iw, ih);
    }

    if (showGrid && gridSize > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1 / camera.zoom;
      const vW = w / camera.zoom;
      const vH = h / camera.zoom;
      const startX = Math.floor((-camera.x / camera.zoom) / gridSize) * gridSize;
      const startY = Math.floor((-camera.y / camera.zoom) / gridSize) * gridSize;
      const endX = startX + vW + gridSize * 2;
      const endY = startY + vH + gridSize * 2;
      ctx.beginPath();
      for (let x = startX; x <= endX; x += gridSize) { ctx.moveTo(x, startY); ctx.lineTo(x, endY); }
      for (let y = startY; y <= endY; y += gridSize) { ctx.moveTo(startX, y); ctx.lineTo(endX, y); }
      ctx.stroke();
    }

    inkCtx.setTransform(1, 0, 0, 1, 0, 0);
    inkCtx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
    inkCtx.setTransform(camera.zoom * ratio, 0, 0, camera.zoom * ratio, camera.x * ratio, camera.y * ratio);

    allPaths.forEach(path => {
      if (!path.points || path.points.length === 0) return;
      inkCtx.lineCap = 'round';
      inkCtx.lineJoin = 'round';
      inkCtx.lineWidth = path.width;
      inkCtx.globalCompositeOperation = path.tool === 'eraser' ? 'destination-out' : 'source-over';
      inkCtx.strokeStyle = path.tool === 'eraser' ? 'rgba(0,0,0,1)' : path.color;
      if (isShapeTool(path.tool) && path.points.length >= 2) {
        drawShape(inkCtx, path.tool, path.points[0], path.points[path.points.length - 1]);
      } else if (path.points.length >= 2) {
        inkCtx.beginPath();
        inkCtx.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i++) inkCtx.lineTo(path.points[i].x, path.points[i].y);
        inkCtx.stroke();
      }
    });

    if (isDrawingRef.current && currentPathRef.current.length > 0) {
      inkCtx.lineCap = 'round';
      inkCtx.lineJoin = 'round';
      inkCtx.lineWidth = lineWidthRef.current;
      inkCtx.globalCompositeOperation = toolRef.current === 'eraser' ? 'destination-out' : 'source-over';
      inkCtx.strokeStyle = toolRef.current === 'eraser' ? 'rgba(0,0,0,1)' : colorRef.current;
      if (isShapeTool(toolRef.current) && shapeStartRef.current) {
        drawShape(inkCtx, toolRef.current, shapeStartRef.current, currentPathRef.current[currentPathRef.current.length - 1]);
      } else if (currentPathRef.current.length >= 1) {
        inkCtx.beginPath();
        inkCtx.moveTo(currentPathRef.current[0].x, currentPathRef.current[0].y);
        for (let i = 1; i < currentPathRef.current.length; i++) inkCtx.lineTo(currentPathRef.current[i].x, currentPathRef.current[i].y);
        inkCtx.stroke();
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(inkCanvas, 0, 0);

    ctx.setTransform(camera.zoom * ratio, 0, 0, camera.zoom * ratio, camera.x * ratio, camera.y * ratio);
    tokens.forEach(tk => {
      const img = tokenImagesRef.current.get(tk.imageUrl);
      const s = tk.size;
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(tk.x + s / 2, tk.y + s / 2, s / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, tk.x, tk.y, s, s);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(tk.x + s / 2, tk.y + s / 2, s / 2, 0, Math.PI * 2);
        ctx.strokeStyle = '#5865f2';
        ctx.lineWidth = 3 / camera.zoom;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(tk.x + s / 2, tk.y + s / 2, s / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#5865f2';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 / camera.zoom;
        ctx.stroke();
      }
      if (tk.label) {
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${12/camera.zoom}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(tk.label, tk.x + s / 2, tk.y + s + 16 / camera.zoom);
      }
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [allPaths, tokens, camera, bgImageObj, showGrid, gridSize, renderTick, isFullScreen]);

  const drawShape = (ctx: CanvasRenderingContext2D, st: string, start: Point, end: Point) => {
    ctx.beginPath();
    switch (st) {
      case 'line': ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); break;
      case 'rect': ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y); break;
      case 'circle': {
        const rx = Math.abs(end.x - start.x) / 2;
        const ry = Math.abs(end.y - start.y) / 2;
        if (rx > 0 && ry > 0) ctx.ellipse(start.x + (end.x - start.x) / 2, start.y + (end.y - start.y) / 2, rx, ry, 0, 0, Math.PI * 2);
        break;
      }
      case 'arrow': {
        ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y);
        const ang = Math.atan2(end.y - start.y, end.x - start.x);
        const hl = 15 / cameraRef.current.zoom;
        ctx.lineTo(end.x - hl * Math.cos(ang - Math.PI / 6), end.y - hl * Math.sin(ang - Math.PI / 6));
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - hl * Math.cos(ang + Math.PI / 6), end.y - hl * Math.sin(ang + Math.PI / 6));
        break;
      }
    }
    ctx.stroke();
  };

  const screenToWorld = useCallback((clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const cam = cameraRef.current;
    return { x: (sx - cam.x) / cam.zoom, y: (sy - cam.y) / cam.zoom };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      cameraStartRef.current = { ...cameraRef.current };
      return;
    }
    if (e.button !== 0) return;

    const pos = screenToWorld(e.clientX, e.clientY);
    if (toolRef.current === 'select') {
      const tks = tokensRef.current;
      for (let i = tks.length - 1; i >= 0; i--) {
        const tk = tks[i];
        const dx = pos.x - (tk.x + tk.size / 2);
        const dy = pos.y - (tk.y + tk.size / 2);
        if (dx * dx + dy * dy <= (tk.size / 2) * (tk.size / 2)) {
          if (e.altKey) {
            const newToken = { ...tk, id: genId(), x: tk.x + 20, y: tk.y + 20, userId };
            setTokens(prev => [...prev, newToken]);
            socket.emit('vtt-token-add', newToken);
            draggingTokenRef.current = newToken.id;
            tokenDragOffsetRef.current = { x: pos.x - newToken.x, y: pos.y - newToken.y };
          } else {
            draggingTokenRef.current = tk.id;
            tokenDragOffsetRef.current = { x: pos.x - tk.x, y: pos.y - tk.y };
          }
          return;
        }
      }
      return;
    }

    isDrawingRef.current = true;
    currentPathRef.current = [pos];
    currentPathIdRef.current = genId();
    if (isShapeTool(toolRef.current)) {
      shapeStartRef.current = pos;
    } else {
      socket.emit('vtt-draw', { point: pos, color: colorRef.current, width: lineWidthRef.current, tool: toolRef.current, isNew: true, id: currentPathIdRef.current });
    }
    forceRender();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanningRef.current) {
      const dx = (e.clientX - panStartRef.current.x);
      const dy = (e.clientY - panStartRef.current.y);
      setCamera({ ...cameraStartRef.current, x: cameraStartRef.current.x + dx, y: cameraStartRef.current.y + dy });
      return;
    }
    if (draggingTokenRef.current) {
      const pos = screenToWorld(e.clientX, e.clientY);
      const nx = pos.x - tokenDragOffsetRef.current.x;
      const ny = pos.y - tokenDragOffsetRef.current.y;
      setTokens(prev => prev.map(tk => tk.id === draggingTokenRef.current ? { ...tk, x: nx, y: ny } : tk));
      return;
    }
    if (!isDrawingRef.current) return;
    const pos = screenToWorld(e.clientX, e.clientY);
    if (isShapeTool(toolRef.current)) {
      currentPathRef.current = [shapeStartRef.current!, pos];
    } else {
      currentPathRef.current.push(pos);
      socket.emit('vtt-draw', { point: pos, isNew: false, id: currentPathIdRef.current });
    }
    forceRender();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (canvas) canvas.releasePointerCapture(e.pointerId);
    if (isPanningRef.current) { isPanningRef.current = false; return; }
    if (draggingTokenRef.current) {
      const tk = tokensRef.current.find(t => t.id === draggingTokenRef.current);
      if (tk) socket.emit('vtt-token-move', { id: tk.id, x: tk.x, y: tk.y });
      draggingTokenRef.current = null;
      return;
    }
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const id = currentPathIdRef.current;
    const curTool = toolRef.current as any;
    const curPath = currentPathRef.current;
    if (isShapeTool(curTool) && shapeStartRef.current && curPath.length >= 2) {
      const end = curPath[curPath.length - 1];
      const np = { points: [shapeStartRef.current, end], color: colorRef.current, width: lineWidthRef.current, tool: curTool, userId: 'local', id };
      setAllPaths(prev => [...prev, np]);
      setUndoStack(prev => [...prev, np]);
      socket.emit('vtt-shape', { start: shapeStartRef.current, end, color: colorRef.current, width: lineWidthRef.current, tool: curTool, id });
    } else if (curPath.length >= 1) {
      const np = { points: [...curPath], color: colorRef.current, width: lineWidthRef.current, tool: curTool, userId: 'local', id };
      setAllPaths(prev => [...prev, np]);
      setUndoStack(prev => [...prev, np]);
    }
    setRedoStack([]);
    forceRender();
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const pos = screenToWorld(e.clientX, e.clientY);
    const tks = tokensRef.current;
    for (let i = tks.length - 1; i >= 0; i--) {
      const tk = tks[i];
      const dx = pos.x - (tk.x + tk.size / 2);
      const dy = pos.y - (tk.y + tk.size / 2);
      if (dx * dx + dy * dy <= (tk.size / 2) * (tk.size / 2)) {
        const newLabel = prompt(t('virtual_tabletop.rename_token') || 'Rinomina Token', tk.label);
        if (newLabel !== null) {
          const newSizeStr = prompt(t('virtual_tabletop.resize_token') || 'Dimensione Token (px)', tk.size.toString());
          const newSize = parseInt(newSizeStr || '') || tk.size;
          const updated = { ...tk, label: newLabel, size: newSize };
          setTokens(prev => prev.map(t => t.id === tk.id ? updated : t));
          socket.emit('vtt-token-update', updated);
        }
        return;
      }
    }
  };

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const pos = screenToWorld(e.clientX, e.clientY);

    if (e.shiftKey) {
      const tks = tokensRef.current;
      for (let i = tks.length - 1; i >= 0; i--) {
        const tk = tks[i];
        const dx = pos.x - (tk.x + tk.size / 2);
        const dy = pos.y - (tk.y + tk.size / 2);
        if (dx * dx + dy * dy <= (tk.size / 2) * (tk.size / 2)) {
          const delta = e.deltaY > 0 ? 0.9 : 1.1;
          const newSize = Math.max(10, Math.min(1000, Math.round(tk.size * delta)));
          const updated = { ...tk, size: newSize };
          setTokens(prev => prev.map(t => t.id === tk.id ? updated : t));
          socket.emit('vtt-token-update', updated);
          return;
        }
      }
    }

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setCamera(prev => {
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.zoom * delta));
      return { zoom, x: mx - (mx - prev.x) * (zoom / prev.zoom), y: my - (my - prev.y) * (zoom / prev.zoom) };
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (el) { el.addEventListener('wheel', handleWheel, { passive: false }); return () => el.removeEventListener('wheel', handleWheel); }
  }, [handleWheel]);

  const preventContextMenu = useCallback((e: React.MouseEvent) => e.preventDefault(), []);
  const resetView = useCallback(() => setCamera({ x: 0, y: 0, zoom: 1 }), []);

  const handlePointerDownAction = (e: React.MouseEvent) => {
    if (e.button === 2) {
       e.preventDefault();
       const pos = screenToWorld(e.clientX, e.clientY);
       const tks = tokensRef.current;
       for (let i = tks.length - 1; i >= 0; i--) {
         const tk = tks[i];
         const dx = pos.x - (tk.x + tk.size / 2);
         const dy = pos.y - (tk.y + tk.size / 2);
         if (dx * dx + dy * dy <= (tk.size / 2) * (tk.size / 2)) {
           setTokens(prev => prev.filter(t => t.id !== tk.id));
           socket.emit('vtt-token-remove', { id: tk.id });
           return;
         }
       }
    }
  };

  const handleUndo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack(r => [...r, last]);
      setAllPaths(p => p.filter(pp => pp.id !== last.id));
      socket.emit('vtt-undo', { pathId: last.id });
      return prev.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setUndoStack(u => [...u, last]);
      setAllPaths(p => [...p, last]);
      socket.emit('vtt-redo', last);
      return prev.slice(0, -1);
    });
  }, []);

  return (
    <div className={`flex flex-col min-h-0 bg-[#1e1f22] select-none ${isFullScreen ? 'fixed inset-0 z-[200]' : 'flex-1 rounded-lg overflow-hidden border border-[#1e1f22]'}`}>
      <div className="bg-[#232428] border-b border-[#1e1f22] flex items-center gap-1 px-2 py-1.5 shrink-0 flex-wrap">
        <div className="flex bg-[#1e1f22] rounded-lg p-0.5 gap-0.5">
          <ToolBtn active={tool === 'select'} onClick={() => setTool('select')} title={t('virtual_tabletop.select')}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg></ToolBtn>
          <ToolBtn active={tool === 'pencil'} onClick={() => setTool('pencil')} title={t('virtual_tabletop.pencil')}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></ToolBtn>
          <ToolBtn active={tool === 'eraser'} onClick={() => setTool('eraser')} title={t('virtual_tabletop.eraser')}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></ToolBtn>
        </div>
        <div className="flex bg-[#1e1f22] rounded-lg p-0.5 gap-0.5">
          <ToolBtn active={tool === 'line'} onClick={() => setTool('line')} title={t('virtual_tabletop.line')}><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="5" y1="19" x2="19" y2="5" strokeWidth={2} strokeLinecap="round"/></svg></ToolBtn>
          <ToolBtn active={tool === 'rect'} onClick={() => setTool('rect')} title={t('virtual_tabletop.rectangle')}><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="6" width="16" height="12" rx="1" strokeWidth={2}/></svg></ToolBtn>
          <ToolBtn active={tool === 'circle'} onClick={() => setTool('circle')} title={t('virtual_tabletop.circle')}><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="8" strokeWidth={2}/></svg></ToolBtn>
          <ToolBtn active={tool === 'arrow'} onClick={() => setTool('arrow')} title={t('virtual_tabletop.arrow')}><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19L19 5m0 0h-8m8 0v8"/></svg></ToolBtn>
        </div>
        {tool !== 'select' && tool !== 'eraser' && (
          <div className="flex gap-1 ml-1">
            {['#5865f2', '#f23f42', '#23a559', '#f9a8d4', '#fee75c', '#ffffff'].map(c => (
              <button key={c} onClick={() => setColor(c)} className={`w-5 h-5 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`} style={{ backgroundColor: c }} />
            ))}
            <input type="range" min="1" max="25" value={lineWidth} onChange={e => setLineWidth(parseInt(e.target.value))} className="w-12" />
          </div>
        )}
        <div className="w-px h-6 bg-[#3f4147] mx-1" />
        <button onClick={() => setShowGrid(!showGrid)} className={`p-1.5 rounded ${showGrid ? 'bg-[#5865f2] text-white' : 'text-gray-400 hover:text-white'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 9h16M4 14h16M9 4v16" /></svg></button>
        <input type="number" value={gridSize} onChange={e => setGridSize(parseInt(e.target.value) || 50)} className="w-10 bg-transparent text-white text-[11px] text-center" />
        <input type="file" ref={tokenInputRef} className="hidden" onChange={(e) => {
           const f = e.target.files?.[0]; if (!f) return;
           const r = new FileReader(); r.onload = () => {
             const tk = { id: genId(), x: 500, y: 500, size: gridSize, imageUrl: r.result as string, label: f.name.replace(/\.[^.]+$/, ''), userId };
             setTokens(p => [...p, tk]); socket.emit('vtt-token-add', tk);
           }; r.readAsDataURL(f);
           e.target.value = '';
        }} />
        <button onClick={() => tokenInputRef.current?.click()} className="p-1.5 text-gray-400 hover:text-white" title={t('virtual_tabletop.add_token')}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button>
        <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => {
           const f = e.target.files?.[0]; if (!f) return;
           const r = new FileReader(); r.onload = () => { setBackgroundImage(r.result as string); socket.emit('vtt-bg', r.result); };
           r.readAsDataURL(f);
           e.target.value = '';
        }} />
        <button onClick={() => fileInputRef.current?.click()} className="p-1.5 text-gray-400 hover:text-white" title={t('virtual_tabletop.upload_bg')}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></button>
        <button onClick={handleUndo} className="p-1.5 text-gray-400 hover:text-white"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4"/></svg></button>
        <button onClick={handleRedo} className="p-1.5 text-gray-400 hover:text-white"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2m15-7l-4-4m4 4l-4 4"/></svg></button>
        <button onClick={resetView} className="p-1.5 text-gray-400 hover:text-white ml-auto" title={t('virtual_tabletop.reset_view')}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg></button>
        <button onClick={() => setIsFullScreen(!isFullScreen)} className={`p-1.5 rounded transition-all ${isFullScreen ? 'bg-[#f23f42] text-white' : 'text-gray-400 hover:text-white hover:bg-[#35373c]'}`} title={isFullScreen ? t('virtual_tabletop.exit_fullscreen') : t('virtual_tabletop.fullscreen')}>
          {isFullScreen ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
          )}
        </button>
      </div>
      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-[#1e1f22]" onContextMenu={preventContextMenu} onMouseDown={handlePointerDownAction} onDoubleClick={handleDoubleClick}>
        <canvas ref={canvasRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} className="block w-full h-full" style={{ touchAction: 'none' }} />
      </div>
    </div>
  );
};

export default VirtualTabletop;
