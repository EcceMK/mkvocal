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
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const DEFAULT_GRID_SIZE = 50;

const genId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 6);

type ToolType = 'pencil' | 'eraser' | 'line' | 'rect' | 'circle' | 'arrow' | 'select';

const VirtualTabletop: React.FC<VirtualTabletopProps> = ({ userId, onSendToChat }) => {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  // Drawing state refs
  const isDrawingRef = useRef(false);
  const currentPathRef = useRef<Point[]>([]);
  const shapeStartRef = useRef<Point | null>(null);
  const currentPathIdRef = useRef<string>('');
  const toolRef = useRef<ToolType>(tool);
  const colorRef = useRef(color);
  const lineWidthRef = useRef(lineWidth);

  // Keep refs in sync
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { lineWidthRef.current = lineWidth; }, [lineWidth]);

  // Pan state refs
  const isPanningRef = useRef(false);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const cameraStartRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });

  // Token drag state refs
  const draggingTokenRef = useRef<string | null>(null);
  const tokenDragOffsetRef = useRef<Point>({ x: 0, y: 0 });

  // Token image cache
  const tokenImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Undo/redo
  const [undoStack, setUndoStack] = useState<VTTPath[]>([]);
  const [redoStack, setRedoStack] = useState<VTTPath[]>([]);

  const lastPinchDistRef = useRef<number | null>(null);
  const cameraRef = useRef(camera);
  useEffect(() => { cameraRef.current = camera; }, [camera]);

  const isShapeTool = (t: string) => ['line', 'rect', 'circle', 'arrow'].includes(t);

  const forceRender = () => setRenderTick(t => t + 1);

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

    socket.on('vtt-history', (history: VTTPath[]) => setAllPaths(history));
    socket.on('vtt-bg', (bg: string | null) => setBackgroundImage(bg));
    socket.on('vtt-undo', ({ pathId }: { pathId: string }) => {
      setAllPaths(prev => prev.filter(p => p.id !== pathId));
    });
    socket.on('vtt-redo', (pathData: VTTPath) => {
      setAllPaths(prev => [...prev, pathData]);
    });

    // Token events
    socket.on('vtt-tokens', (serverTokens: Token[]) => setTokens(serverTokens));
    socket.on('vtt-token-add', (token: Token) => {
      setTokens(prev => [...prev, token]);
    });
    socket.on('vtt-token-move', ({ id, x, y }: { id: string; x: number; y: number }) => {
      setTokens(prev => prev.map(tk => tk.id === id ? { ...tk, x, y } : tk));
    });
    socket.on('vtt-token-remove', ({ id }: { id: string }) => {
      setTokens(prev => prev.filter(tk => tk.id !== id));
    });

    socket.emit('get-vtt-history');

    return () => {
      socket.off('vtt-draw'); socket.off('vtt-shape'); socket.off('vtt-clear');
      socket.off('vtt-history'); socket.off('vtt-bg'); socket.off('vtt-undo'); socket.off('vtt-redo');
      socket.off('vtt-tokens'); socket.off('vtt-token-add'); socket.off('vtt-token-move'); socket.off('vtt-token-remove');
    };
  }, []);

  // ---- Background image loading ----
  useEffect(() => {
    if (backgroundImage) {
      const img = new Image();
      img.onload = () => setBgImageObj(img);
      img.src = backgroundImage;
    } else {
      setBgImageObj(null);
    }
  }, [backgroundImage]);

  // ---- Load token images ----
  useEffect(() => {
    tokens.forEach(tk => {
      if (!tokenImagesRef.current.has(tk.imageUrl)) {
        const img = new Image();
        img.onload = () => { tokenImagesRef.current.set(tk.imageUrl, img); forceRender(); };
        img.src = tk.imageUrl;
        tokenImagesRef.current.set(tk.imageUrl, img); // placeholder while loading
      }
    });
  }, [tokens]);

  // ---- Canvas rendering ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1e1f22';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply camera transform
    ctx.setTransform(camera.zoom, 0, 0, camera.zoom, camera.x, camera.y);

    // Background image
    if (bgImageObj) {
      const scale = Math.min(CANVAS_W / bgImageObj.width, CANVAS_H / bgImageObj.height);
      const w = bgImageObj.width * scale;
      const h = bgImageObj.height * scale;
      ctx.drawImage(bgImageObj, (CANVAS_W - w) / 2, (CANVAS_H - h) / 2, w, h);
    }

    // Grid overlay
    if (showGrid && gridSize > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= CANVAS_W; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_H);
      }
      for (let y = 0; y <= CANVAS_H; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_W, y);
      }
      ctx.stroke();
    }

    // Render all paths
    allPaths.forEach(path => {
      if (!path.points || path.points.length === 0) return;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = path.width;

      if (path.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = path.color;
      }

      if (isShapeTool(path.tool) && path.points.length >= 2) {
        drawShape(ctx, path.tool, path.points[0], path.points[path.points.length - 1], path.color, path.width);
      } else if (path.points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(path.points[i].x, path.points[i].y);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    });

    // Current drawing preview
    const curPath = currentPathRef.current;
    if (isDrawingRef.current && curPath.length > 0) {
      const curTool = toolRef.current;
      const curColor = colorRef.current;
      const curWidth = lineWidthRef.current;

      if (isShapeTool(curTool) && shapeStartRef.current) {
        drawShape(ctx, curTool, shapeStartRef.current, curPath[curPath.length - 1], curColor, curWidth);
      } else if (curPath.length >= 2) {
        ctx.beginPath();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = curWidth;
        ctx.globalCompositeOperation = curTool === 'eraser' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = curTool === 'eraser' ? 'rgba(0,0,0,1)' : curColor;
        ctx.moveTo(curPath[0].x, curPath[0].y);
        for (let i = 1; i < curPath.length; i++) ctx.lineTo(curPath[i].x, curPath[i].y);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // Render tokens
    ctx.globalCompositeOperation = 'source-over';
    tokens.forEach(tk => {
      const img = tokenImagesRef.current.get(tk.imageUrl);
      const s = tk.size;
      if (img && img.complete && img.naturalWidth > 0) {
        // Circular clip
        ctx.save();
        ctx.beginPath();
        ctx.arc(tk.x + s / 2, tk.y + s / 2, s / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, tk.x, tk.y, s, s);
        ctx.restore();
        // Border
        ctx.beginPath();
        ctx.arc(tk.x + s / 2, tk.y + s / 2, s / 2, 0, Math.PI * 2);
        ctx.strokeStyle = '#5865f2';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        // Placeholder circle
        ctx.beginPath();
        ctx.arc(tk.x + s / 2, tk.y + s / 2, s / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#5865f2';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      // Label
      if (tk.label) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(tk.label, tk.x + s / 2, tk.y + s + 16, s + 20);
      }
    });

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [allPaths, tokens, camera, bgImageObj, showGrid, gridSize, renderTick, color, lineWidth, tool]);

  // ---- Shape drawing helper ----
  const drawShape = (ctx: CanvasRenderingContext2D, shapeTool: string, start: Point, end: Point, col: string, w: number) => {
    ctx.beginPath();
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';

    switch (shapeTool) {
      case 'line':
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        break;
      case 'rect':
        ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
        break;
      case 'circle': {
        const rx = Math.abs(end.x - start.x) / 2;
        const ry = Math.abs(end.y - start.y) / 2;
        if (rx > 0 && ry > 0) {
          ctx.ellipse(start.x + (end.x - start.x) / 2, start.y + (end.y - start.y) / 2, rx, ry, 0, 0, Math.PI * 2);
        }
        break;
      }
      case 'arrow': {
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const headLen = Math.max(12, w * 4);
        ctx.lineTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6));
        break;
      }
    }
    ctx.stroke();
  };

  // ---- Coordinate conversion ----
  const screenToWorld = useCallback((clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = (clientX - rect.left) * (canvas.width / rect.width);
    const sy = (clientY - rect.top) * (canvas.height / rect.height);
    const cam = cameraRef.current;
    return { x: (sx - cam.x) / cam.zoom, y: (sy - cam.y) / cam.zoom };
  }, []);

  // ---- Find token at position ----
  const findTokenAt = useCallback((pos: Point): Token | null => {
    // Reverse so topmost token is found first
    for (let i = tokens.length - 1; i >= 0; i--) {
      const tk = tokens[i];
      const dx = pos.x - (tk.x + tk.size / 2);
      const dy = pos.y - (tk.y + tk.size / 2);
      if (dx * dx + dy * dy <= (tk.size / 2) * (tk.size / 2)) return tk;
    }
    return null;
  }, [tokens]);

  // ---- Pointer handlers ----
  const handlePointerDown = (e: React.PointerEvent) => {
    // Pan with middle/right click
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      cameraStartRef.current = { ...cameraRef.current };
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    const pos = screenToWorld(e.clientX, e.clientY);

    // Select tool: try to pick up a token
    if (toolRef.current === 'select') {
      const hit = findTokenAt(pos);
      if (hit) {
        draggingTokenRef.current = hit.id;
        tokenDragOffsetRef.current = { x: pos.x - hit.x, y: pos.y - hit.y };
      }
      return;
    }

    // Right-click on token in any mode => remove
    // (handled via context menu separately)

    // Drawing
    isDrawingRef.current = true;
    currentPathRef.current = [pos];
    const id = genId();
    currentPathIdRef.current = id;

    if (isShapeTool(toolRef.current)) {
      shapeStartRef.current = pos;
    } else {
      socket.emit('vtt-draw', { point: pos, color: colorRef.current, width: lineWidthRef.current, tool: toolRef.current, isNew: true, id });
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanningRef.current) {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const dx = (e.clientX - panStartRef.current.x) * (canvas.width / rect.width);
      const dy = (e.clientY - panStartRef.current.y) * (canvas.height / rect.height);
      setCamera({ ...cameraStartRef.current, x: cameraStartRef.current.x + dx, y: cameraStartRef.current.y + dy });
      return;
    }

    // Token dragging
    if (draggingTokenRef.current) {
      const pos = screenToWorld(e.clientX, e.clientY);
      const newX = pos.x - tokenDragOffsetRef.current.x;
      const newY = pos.y - tokenDragOffsetRef.current.y;
      setTokens(prev => prev.map(tk => tk.id === draggingTokenRef.current ? { ...tk, x: newX, y: newY } : tk));
      return;
    }

    if (!isDrawingRef.current) return;
    const pos = screenToWorld(e.clientX, e.clientY);

    if (isShapeTool(toolRef.current)) {
      currentPathRef.current = [shapeStartRef.current!, pos];
    } else {
      currentPathRef.current = [...currentPathRef.current, pos];
      socket.emit('vtt-draw', { point: pos, isNew: false, id: currentPathIdRef.current });
    }
    forceRender();
  };

  const handlePointerUp = () => {
    if (isPanningRef.current) { isPanningRef.current = false; return; }

    // Token drop
    if (draggingTokenRef.current) {
      const tk = tokens.find(t => t.id === draggingTokenRef.current);
      if (tk) socket.emit('vtt-token-move', { id: tk.id, x: tk.x, y: tk.y });
      draggingTokenRef.current = null;
      return;
    }

    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    const id = currentPathIdRef.current;
    const curTool = toolRef.current as VTTPath['tool'];
    let newPath: VTTPath;

    if (isShapeTool(curTool) && shapeStartRef.current && currentPathRef.current.length >= 2) {
      const end = currentPathRef.current[currentPathRef.current.length - 1];
      newPath = { points: [shapeStartRef.current, end], color: colorRef.current, width: lineWidthRef.current, tool: curTool, userId: 'local', id };
      socket.emit('vtt-shape', { start: shapeStartRef.current, end, color: colorRef.current, width: lineWidthRef.current, tool: curTool, id });
    } else {
      newPath = { points: currentPathRef.current, color: colorRef.current, width: lineWidthRef.current, tool: curTool, userId: 'local', id };
    }

    if (newPath.points.length >= 2) {
      setAllPaths(prev => [...prev, newPath]);
      setUndoStack(prev => [...prev, newPath]);
      setRedoStack([]);
    }
    currentPathRef.current = [];
    shapeStartRef.current = null;
  };

  // ---- Zoom (wheel) ----
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setCamera(prev => {
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.zoom * delta));
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
      const my = (e.clientY - rect.top) * (canvas.height / rect.height);
      return { zoom: newZoom, x: mx - (mx - prev.x) * (newZoom / prev.zoom), y: my - (my - prev.y) * (newZoom / prev.zoom) };
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // ---- Touch pinch-to-zoom ----
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (lastPinchDistRef.current !== null) {
        const scale = dist / lastPinchDistRef.current;
        setCamera(prev => ({ ...prev, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.zoom * scale)) }));
      }
      lastPinchDistRef.current = dist;
    }
  }, []);
  const handleTouchEnd = useCallback(() => { lastPinchDistRef.current = null; }, []);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);
    return () => { el.removeEventListener('touchmove', handleTouchMove); el.removeEventListener('touchend', handleTouchEnd); };
  }, [handleTouchMove, handleTouchEnd]);

  // ---- Undo / Redo ----
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  const preventContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    // Right click on token => remove it
    const pos = screenToWorld(e.clientX, e.clientY);
    const hit = findTokenAt(pos);
    if (hit) {
      setTokens(prev => prev.filter(tk => tk.id !== hit.id));
      socket.emit('vtt-token-remove', { id: hit.id });
    }
  };

  // ---- Actions ----
  const clearOwn = () => {
    setAllPaths(prev => prev.filter(p => p.userId !== 'local'));
    setUndoStack([]); setRedoStack([]);
    socket.emit('vtt-clear');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => { setBackgroundImage(reader.result as string); socket.emit('vtt-bg', reader.result); };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleTokenUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const label = file.name.replace(/\.[^.]+$/, '').substring(0, 12);
      const token: Token = {
        id: genId(), x: CANVAS_W / 2 - gridSize / 2, y: CANVAS_H / 2 - gridSize / 2,
        size: gridSize, imageUrl: reader.result as string, label, userId
      };
      setTokens(prev => [...prev, token]);
      socket.emit('vtt-token-add', token);
    };
    reader.readAsDataURL(file);
    if (tokenInputRef.current) tokenInputRef.current.value = '';
  };

  const clearBackground = () => { setBackgroundImage(null); socket.emit('vtt-clear-bg'); };

  const downloadCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const temp = document.createElement('canvas');
    temp.width = canvas.width; temp.height = canvas.height;
    const tCtx = temp.getContext('2d')!;
    tCtx.fillStyle = '#1e1f22';
    tCtx.fillRect(0, 0, temp.width, temp.height);
    tCtx.drawImage(canvas, 0, 0);
    const link = document.createElement('a');
    link.download = `vtt-${Date.now()}.png`;
    link.href = temp.toDataURL('image/png');
    link.click();
  };

  const sendToChat = () => {
    if (!onSendToChat) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const temp = document.createElement('canvas');
    temp.width = canvas.width; temp.height = canvas.height;
    const tCtx = temp.getContext('2d')!;
    tCtx.fillStyle = '#1e1f22';
    tCtx.fillRect(0, 0, temp.width, temp.height);
    tCtx.drawImage(canvas, 0, 0);
    onSendToChat(temp.toDataURL('image/png'));
    showToastMsg(t('virtual_tabletop.sent_to_chat') || 'Inviato in chat!');
  };

  const resetView = () => setCamera({ x: 0, y: 0, zoom: 1 });

  const showToastMsg = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 2500); };

  // ---- Tool button helper ----
  const ToolBtn = ({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) => (
    <button onClick={onClick} title={title}
      className={`p-1.5 rounded transition-all cursor-pointer ${active ? 'bg-[#5865f2] text-white' : 'text-gray-400 hover:text-white'}`}>
      {children}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#1e1f22] rounded-lg overflow-hidden border border-[#1e1f22]">
      {/* Toolbar */}
      <div className="bg-[#232428] border-b border-[#1e1f22] flex items-center gap-1 px-2 py-1.5 shrink-0 flex-wrap">
        {/* Select tool */}
        <div className="flex bg-[#1e1f22] rounded-lg p-0.5 gap-0.5">
          <ToolBtn active={tool === 'select'} onClick={() => setTool('select')} title={t('virtual_tabletop.select') || 'Seleziona/Muovi'}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
          </ToolBtn>
        </div>

        {/* Drawing tools */}
        <div className="flex bg-[#1e1f22] rounded-lg p-0.5 gap-0.5">
          <ToolBtn active={tool === 'pencil'} onClick={() => setTool('pencil')} title={t('virtual_tabletop.pencil') || 'Matita'}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          </ToolBtn>
          <ToolBtn active={tool === 'eraser'} onClick={() => setTool('eraser')} title={t('virtual_tabletop.eraser') || 'Gomma'}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </ToolBtn>
        </div>

        {/* Shape tools */}
        <div className="flex bg-[#1e1f22] rounded-lg p-0.5 gap-0.5">
          <ToolBtn active={tool === 'line'} onClick={() => setTool('line')} title={t('virtual_tabletop.line') || 'Linea'}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="5" y1="19" x2="19" y2="5" strokeWidth={2} strokeLinecap="round"/></svg>
          </ToolBtn>
          <ToolBtn active={tool === 'rect'} onClick={() => setTool('rect')} title={t('virtual_tabletop.rectangle') || 'Rettangolo'}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="6" width="16" height="12" rx="1" strokeWidth={2}/></svg>
          </ToolBtn>
          <ToolBtn active={tool === 'circle'} onClick={() => setTool('circle')} title={t('virtual_tabletop.circle') || 'Cerchio'}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="8" strokeWidth={2}/></svg>
          </ToolBtn>
          <ToolBtn active={tool === 'arrow'} onClick={() => setTool('arrow')} title={t('virtual_tabletop.arrow') || 'Freccia'}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19L19 5m0 0h-8m8 0v8"/></svg>
          </ToolBtn>
        </div>

        {/* Colors */}
        {tool !== 'eraser' && tool !== 'select' && (
          <div className="flex gap-1 ml-1">
            {['#5865f2', '#f23f42', '#23a559', '#f9a8d4', '#fee75c', '#ffffff'].map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-5 h-5 rounded-full border-2 cursor-pointer hover:scale-110 transition-transform ${color === c ? 'border-white' : 'border-transparent'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        )}

        {/* Width */}
        {tool !== 'select' && (
          <div className="flex items-center gap-1 ml-1">
            <input type="range" min="1" max="25" value={lineWidth} onChange={e => setLineWidth(parseInt(e.target.value))}
              className="w-16 h-1 bg-[#1e1f22] rounded appearance-none cursor-pointer accent-[#5865f2]" />
            <span className="text-[10px] text-gray-400 w-4">{lineWidth}</span>
          </div>
        )}

        <div className="w-px h-6 bg-[#3f4147] mx-1" />

        {/* Grid toggle */}
        <button onClick={() => setShowGrid(!showGrid)}
          className={`p-1.5 rounded cursor-pointer transition-all ${showGrid ? 'bg-[#5865f2] text-white' : 'text-gray-400 hover:text-white'}`}
          title={t('virtual_tabletop.grid') || 'Griglia'}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 9h16M4 14h16M9 4v16M14 4v16" /></svg>
        </button>
        {showGrid && (
          <input type="number" min="20" max="200" value={gridSize} onChange={e => setGridSize(Math.max(20, parseInt(e.target.value) || 50))}
            className="w-12 bg-[#1e1f22] text-gray-300 text-[10px] rounded px-1 py-0.5 text-center outline-none" title="Grid size" />
        )}

        <div className="w-px h-6 bg-[#3f4147] mx-1" />

        {/* Token upload */}
        <input type="file" accept="image/*" ref={tokenInputRef} className="hidden" onChange={handleTokenUpload} />
        <button onClick={() => tokenInputRef.current?.click()}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-[#35373c] cursor-pointer"
          title={t('virtual_tabletop.add_token') || 'Aggiungi Token'}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </button>

        {/* Background */}
        <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
        <button onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-[#35373c] cursor-pointer" title={t('virtual_tabletop.upload_bg') || 'Sfondo'}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        </button>
        {bgImageObj && (
          <button onClick={clearBackground} className="text-[9px] font-bold text-gray-400 hover:text-[#f23f42] px-1 cursor-pointer">X</button>
        )}

        <div className="w-px h-6 bg-[#3f4147] mx-1" />

        {/* Undo / Redo */}
        <button onClick={handleUndo} disabled={undoStack.length === 0} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-[#35373c] cursor-pointer disabled:opacity-30" title="Undo">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4"/></svg>
        </button>
        <button onClick={handleRedo} disabled={redoStack.length === 0} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-[#35373c] cursor-pointer disabled:opacity-30" title="Redo">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2m15-7l-4-4m4 4l-4 4"/></svg>
        </button>

        <div className="w-px h-6 bg-[#3f4147] mx-1" />

        {/* Actions */}
        <button onClick={resetView} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-[#35373c] cursor-pointer" title="Reset">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
        </button>
        <button onClick={downloadCanvas} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-[#35373c] cursor-pointer" title="Download">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4-4V4" /></svg>
        </button>
        <button onClick={sendToChat} className="p-1.5 rounded text-gray-400 hover:text-[#5865f2] hover:bg-[#35373c] cursor-pointer" title="Chat">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
        </button>
        <button onClick={clearOwn} className="text-[9px] font-bold text-gray-400 hover:text-[#f23f42] uppercase tracking-wider px-2 py-1.5 bg-[#1e1f22] rounded hover:bg-[#35373c] cursor-pointer">
          {t('virtual_tabletop.clear_own') || 'PULISCI'}
        </button>

        <span className="ml-auto text-[10px] text-gray-500 font-mono">{Math.round(camera.zoom * 100)}%</span>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-[#1e1f22]"
        style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }} onContextMenu={preventContextMenu}>
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
          onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}
          className="block w-full h-full" style={{ touchAction: 'none' }} />
        {toastMsg && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#23a559] text-white px-6 py-2 rounded-full font-bold shadow-2xl text-sm z-50">
            {toastMsg}
          </div>
        )}
      </div>
    </div>
  );
};

export default VirtualTabletop;
