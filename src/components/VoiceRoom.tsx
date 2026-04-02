'use client';

import React, { useState, useEffect, useRef } from 'react';
import UserList from './UserList';
import { useWebRTC } from '../hooks/useWebRTC';
import socket from '../lib/socket';
import { downloadChatLog } from '@/lib/downloadChatLog';
import { useI18n } from '../lib/i18n';
import FloatingVideo from './FloatingVideo';
import AudioStream from './AudioStream';
import Whiteboard from './Whiteboard';
import VirtualTabletop from './VirtualTabletop';
import LinkPreview from './LinkPreview';
import { parseLinks } from '../lib/chatUtils';

interface VoiceRoomProps {
  username: string;
  roomId: string;
  userId: string;
  onLeave: () => void;
}

const VoiceRoom: React.FC<VoiceRoomProps> = ({ username, roomId, userId, onLeave }) => {
  const { t } = useI18n();
  const [users, setUsers] = useState<{ userId: string; username: string; socketId: string; subRoom?: string; isVideoOn?: boolean; isWhiteboardOn?: boolean; isVTTOn?: boolean }[]>([]);
  const { localStream, remoteStreams, subRoom, switchSubRoom, speakingUsers, isVideoOn, toggleVideo, usersWithVideo, isScreenSharing, toggleScreenSharing } = useWebRTC(roomId, userId, username);
  const [remoteUserSettings, setRemoteUserSettings] = useState<Record<string, { volume: number, muted: boolean }>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [messages, setMessages] = useState<{ id?: string, username: string, content?: string, text?: string, fileData?: string, fileName?: string, fileType?: string, reactions?: { [key: string]: string[] } }[]>([]);
  const [inputText, setInputText] = useState('');
  const [hiddenVideos, setHiddenVideos] = useState<Set<string>>(new Set());
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showDiceModal, setShowDiceModal] = useState(false);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡'];
  const [numDice, setNumDice] = useState(1);
  const [diceType, setDiceType] = useState(20);
  const [pendingImport, setPendingImport] = useState<{ messages: any[], filename: string, count: number, start: string, end: string } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showVTT, setShowVTT] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    socket.on('all-users', (allUsers) => setUsers(allUsers));
    socket.on('user-joined', (user) => {
      setUsers((prev) => {
        if (prev.some(u => u.socketId === user.socketId)) return prev;
        return [...prev, user];
      });
    });
    socket.on('user-left', ({ socketId }) => {
      setUsers((prev) => prev.filter((u) => u.socketId !== socketId));
      setHiddenVideos(prev => {
        const next = new Set(prev);
        next.delete(socketId);
        return next;
      });
    });

    socket.on('user-switched-subroom', ({ socketId, subRoom: newSubRoom }) => {
      setUsers((prev) => prev.map((u) => (u.socketId === socketId ? { ...u, subRoom: newSubRoom } : u)));
    });

    socket.on('user-toggled-video', ({ socketId, isVideoOn: userVideoOn }) => {
      setUsers((prev) => prev.map(u => u.socketId === socketId ? { ...u, isVideoOn: userVideoOn } : u));
      if (userVideoOn) {
        setHiddenVideos(prev => {
          const next = new Set(prev);
          next.delete(socketId);
          return next;
        });
      }
    });

    socket.on('user-toggled-whiteboard', ({ socketId, isWhiteboardOn }) => {
      setUsers((prev) => prev.map(u => u.socketId === socketId ? { ...u, isWhiteboardOn } : u));
    });

    socket.on('user-toggled-vtt', ({ socketId, isVTTOn }) => {
      setUsers((prev) => prev.map(u => u.socketId === socketId ? { ...u, isVTTOn } : u));
    });

    socket.on('chat-message', (msg) => setMessages((prev) => [...prev, msg]));

    socket.on('chat-message-updated', (updatedMsg) => {
      setMessages((prev) => prev.map(m => m.id === updatedMsg.id ? updatedMsg : m));
    });

    socket.on('chat-history', (history) => {
      setMessages(history);
      setIsImporting(false);
    });

    const handleReconnect = () => {
      socket.emit('reconnect-room', { roomId, userId, username, subRoom });
    };
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('all-users');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('user-switched-subroom');
      socket.off('user-toggled-video');
      socket.off('user-toggled-whiteboard');
      socket.off('chat-message');
      socket.off('chat-message-updated');
      socket.off('chat-history');
      socket.off('connect', handleReconnect);
    };
  }, [roomId, userId, username, subRoom]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    socket.emit('toggle-whiteboard', { isWhiteboardOn: showWhiteboard });
  }, [showWhiteboard]);

  useEffect(() => {
    socket.emit('toggle-vtt', { isVTTOn: showVTT });
  }, [showVTT]);

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const handleLeave = () => {
    socket.disconnect();
    onLeave();
    window.location.reload();
  };
  
  const handleUserSettingsChange = (socketId: string, settings: Partial<{ volume: number, muted: boolean }>) => {
    setRemoteUserSettings(prev => ({
      ...prev,
      [socketId]: {
        ...(prev[socketId] || { volume: 1, muted: false }),
        ...settings
      }
    }));
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      socket.emit('chat-message', {
        username,
        content: inputText,
        // Reaction needs a unique ID on creation, server assigns one but it helps to have it local for immediate UI if needed. We'll wait for server broadcast to avoid duplicates.
      });
      setInputText('');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      alert("File troppo grande (max 100MB)");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      socket.emit('chat-message', {
        username,
        content: '',
        fileData: reader.result as string,
        fileName: file.name,
        fileType: file.type
      });
    };
    reader.readAsDataURL(file);
    if (chatFileInputRef.current) chatFileInputRef.current.value = '';
  };

  const rollDice = () => {
    const results = [];
    let sum = 0;
    for (let i = 0; i < numDice; i++) {
      const roll = Math.floor(Math.random() * diceType) + 1;
      results.push(roll);
      sum += roll;
    }

    let content = `(${numDice} d${diceType}) Lancio di ${username} -> [ ${results.join(', ')} ]`;
    if (numDice > 1) content += ` = ${sum}`;

    socket.emit('chat-message', { username: '🎲 ' + username, content: content });
    setShowDiceModal(false);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        if (Array.isArray(json)) {
          const sorted = [...json].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          const start = sorted.length > 0 ? new Date(sorted[0].timestamp).toLocaleDateString([], { hour: '2-digit', minute: '2-digit' }) : 'N/D';
          const end = sorted.length > 0 ? new Date(sorted[sorted.length - 1].timestamp).toLocaleDateString([], { hour: '2-digit', minute: '2-digit' }) : 'N/D';
          setPendingImport({ messages: json, filename: file.name, count: json.length, start, end });
        } else alert(t('voice_room.json_invalid'));
      } catch (err) { alert(t('voice_room.json_error')); }
    };
    reader.readAsText(file);
    if (importInputRef.current) importInputRef.current.value = '';
  };

  const subRoomUsers = users.filter(u => (!u.subRoom || u.subRoom === 'common') === (subRoom === 'common'));

  return (
    <div className="flex flex-col h-full bg-[#313338] text-white overflow-hidden relative mk-h-100">
      <div className="flex-1 flex overflow-hidden min-h-0">
        <UserList
          users={users}
          currentUser={{ userId, username, subRoom, isSpeaking: speakingUsers.has('local'), isVideoOn, isWhiteboardOn: showWhiteboard, isVTTOn: showVTT }}
          speakingUsers={speakingUsers}
          remoteUserSettings={remoteUserSettings}
          onUserSettingsChange={handleUserSettingsChange}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        <main className="flex-1 flex flex-col min-w-0 bg-[#313338] relative">
          {/* Header */}
          <div className="h-12 flex items-center px-4 shadow-sm border-b border-[#1e1f22] shrink-0">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="mr-3 p-1.5 rounded hover:bg-[#35373c] text-gray-400 hover:text-white transition-colors md:hidden"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <span className="font-bold text-gray-400 mr-2">#</span>
            <span className="font-semibold text-white">{roomId}</span>
          </div>

          {/* Messages or Whiteboard or VTT */}
          <div className={`flex-1 overflow-y-auto ${showVTT || showWhiteboard ? '' : 'p-4 space-y-4'} scrollbar-thin scrollbar-thumb-[#1e1f22] scrollbar-track-transparent flex flex-col`}>
            {showVTT ? (
              <VirtualTabletop
                userId={userId}
                onSendToChat={(dataUrl: string) => {
                  socket.emit('chat-message', {
                    username,
                    content: '',
                    fileData: dataUrl,
                    fileName: `vtt-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
                    fileType: 'image/png'
                  });
                }}
              />
            ) : showWhiteboard ? (
              <Whiteboard
                userId={userId}
                onSendToChat={(dataUrl: string) => {
                  socket.emit('chat-message', {
                    username,
                    content: '',
                    fileData: dataUrl,
                    fileName: `whiteboard-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
                    fileType: 'image/png'
                  });
                }}
              />
            ) : (
              <>
                {isImporting ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                    <svg className="w-8 h-8 animate-spin text-[#5865f2]" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <p className="text-sm font-medium animate-pulse">{t('voice_room.importing_chat') || 'Importazione in corso...'}</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-2">
                    <p className="text-sm font-medium">{t('voice_room.no_messages')}</p>
                  </div>
                ) : (
                  messages.map((msg, i) => {
                    const msgId = msg.id || i.toString();
                    return (
                      <div
                        key={msgId}
                        className="flex flex-col group animate-in fade-in slide-in-from-bottom-2 duration-300 relative rounded-lg hover:bg-[#2b2d31] p-3 -mx-3 transition-colors"
                        onMouseEnter={() => setActiveReactionMsgId(msgId)}
                        onMouseLeave={() => setActiveReactionMsgId(null)}
                      >
                        {/* Reaction Bar (Hover) */}
                        {activeReactionMsgId === msgId && msg.id && (
                          <div className="absolute right-4 -top-4 bg-[#313338] border border-[#1e1f22] rounded flex shadow-lg overflow-hidden z-10 transition-opacity">
                            {REACTION_EMOJIS.map(emoji => (
                              <button
                                key={emoji}
                                onClick={() => socket.emit('chat-reaction', { messageId: msg.id, reaction: emoji, username })}
                                className="px-2 py-1.5 hover:bg-[#3f4147] transition-colors hover:scale-110"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="flex items-baseline gap-2">
                          <span className="font-bold text-[#f2f3f5] hover:underline cursor-pointer">{msg.username}</span>
                          <span className="text-[10px] text-gray-500 font-medium">Oggi alle {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        {(msg.text || msg.content) && (
                          <div className="text-[#dbdee1] leading-relaxed break-words">
                            {parseLinks(msg.text || msg.content || '').map((token, idx) => (
                              <React.Fragment key={idx}>
                                {token.type === 'link' ? (
                                  <>
                                    <a href={token.content} target="_blank" rel="noopener noreferrer" className="text-[#5865f2] hover:underline">
                                      {token.content}
                                    </a>
                                    <LinkPreview url={token.content} />
                                  </>
                                ) : (
                                  token.content
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        )}

                        {/* Generato se l'utente carica un file o un'immagine */}
                        {msg.fileData && (
                          <div className="mt-2">
                            {msg.fileType?.startsWith('image/') ? (
                              <a href={msg.fileData} download={msg.fileName} className="block w-fit">
                                <img
                                  src={msg.fileData}
                                  alt={msg.fileName || 'Image'}
                                  className="rounded-lg object-contain max-w-full"
                                  style={{ maxHeight: '500px', maxWidth: '500px' }}
                                />
                              </a>
                            ) : (
                              <a
                                href={msg.fileData}
                                download={msg.fileName}
                                className="flex items-center gap-3 p-3 bg-[#2b2d31] hover:bg-[#35373c] border border-[#1e1f22] rounded-lg w-fit transition-colors group cursor-pointer"
                              >
                                <div className="w-10 h-10 rounded bg-[#1e1f22] flex items-center justify-center group-hover:bg-[#232428]">
                                  <svg className="w-6 h-6 text-[#5865f2]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-[#dbdee1] group-hover:text-white max-w-[200px] truncate">{msg.fileName}</span>
                                  <span className="text-xs text-gray-500">Documento</span>
                                </div>
                                <div className="ml-2 w-8 h-8 flex items-center justify-center rounded-full bg-[#1e1f22] group-hover:bg-[#5865f2] transition-colors">
                                  <svg className="w-4 h-4 text-gray-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4-4V4" /></svg>
                                </div>
                              </a>
                            )}
                          </div>
                        )}

                        {/* Render Reactions */}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {Object.entries(msg.reactions).map(([emoji, usersArr]) => {
                              const hasReacted = usersArr.includes(username);
                              return (
                                <button
                                  key={emoji}
                                  onClick={() => msg.id && socket.emit('chat-reaction', { messageId: msg.id, reaction: emoji, username })}
                                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${hasReacted ? 'bg-[#5865f2]/20 border-[#5865f2]/50 text-[#dbdee1]' : 'bg-[#2b2d31] border-[#1e1f22] text-gray-400 hover:border-gray-500'} transition-colors`}
                                  title={usersArr.join(', ')}
                                >
                                  <span>{emoji}</span>
                                  <span>{usersArr.length}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Floating Videos Layer */}
          <div className="pointer-events-none absolute inset-0 z-[100] overflow-hidden">
            <div className="pointer-events-auto contents">
              {isVideoOn && !hiddenVideos.has('local') && (
                <FloatingVideo
                  stream={localStream}
                  username={username}
                  isLocal={true}
                  isSpeaking={speakingUsers.has('local')}
                  onClose={toggleVideo}
                  initialX={20}
                  initialY={typeof window !== 'undefined' ? window.innerHeight - 300 : 500}
                />
              )}
              {subRoomUsers.filter(u => usersWithVideo.has(u.socketId) && !hiddenVideos.has(u.socketId)).map((user, index) => (
                <FloatingVideo
                  key={user.socketId}
                  stream={remoteStreams[user.socketId]}
                  username={user.username}
                  isSpeaking={speakingUsers.has(user.socketId)}
                  onClose={() => setHiddenVideos(prev => new Set([...prev, user.socketId]))}
                  initialX={20 + (index + (isVideoOn && !hiddenVideos.has('local') ? 1 : 0)) * 340}
                  initialY={typeof window !== 'undefined' ? window.innerHeight - 300 : 500}
                />
              ))}
            </div>
          </div>

          {/* Input Bar */}
          {!showWhiteboard && !showVTT && (
            <div className="p-4 bg-[#313338] shrink-0">
              <form onSubmit={sendMessage} className="relative group flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => chatFileInputRef.current?.click()}
                  className="w-10 h-10 cursor-pointer rounded-full flex items-center justify-center bg-[#2b2d31] hover:bg-[#35373c] text-gray-400 hover:text-white transition-colors shrink-0"
                  title="Carica un file"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </button>
                <input
                  type="file"
                  className="hidden"
                  ref={chatFileInputRef}
                  onChange={handleFileUpload}
                />
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={t('voice_room.message_placeholder')}
                    className="w-full bg-[#383a40] text-[#dbdee1] rounded-lg px-4 py-3 pr-12 focus:outline-none focus:ring-1 focus:ring-[#5865f2] transition-all"
                  />
                  <button type="submit" className="absolute cursor-pointer right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white transition-colors">
                    <svg className="w-5 h-5 rotate-90" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* Control Bar */}
      <div className="h-16 bg-[#232428] flex items-center justify-between px-4 mt-auto border-t border-[#1e1f22] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-xs font-bold text-white uppercase">{username[0]}</div>
          <div className="flex flex-col">
            <span className="text-[13px] font-bold leading-tight">{username}</span>
            <span className="text-[11px] text-gray-400">{t('voice_room.online')}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setShowDiceModal(true)} className="relative group p-2 cursor-pointer rounded hover:bg-[#35373c] text-gray-300 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2" /><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor" /><circle cx="15.5" cy="8.5" r="1.5" fill="currentColor" /><circle cx="8.5" cy="15.5" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></svg>
            <span className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all pointer-events-none bg-[#111214] text-[#dbdee1] text-[11px] font-bold px-3 py-1.5 rounded shadow-lg whitespace-nowrap z-50">
              {t('voice_room.roll_dice')}
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#111214]"></span>
            </span>
          </button>
          <button onClick={() => switchSubRoom(subRoom === 'common' ? 'private' : 'common')} className={`relative group p-2 cursor-pointer rounded hover:bg-[#35373c] transition-colors ${subRoom === 'private' ? 'text-[#5865f2]' : 'text-gray-300 hover:text-white'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            <span className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all pointer-events-none bg-[#111214] text-[#dbdee1] text-[11px] font-bold px-3 py-1.5 rounded shadow-lg whitespace-nowrap z-50">
              {subRoom === 'private' ? t('voice_room.exit_private') : t('voice_room.enter_private')}
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#111214]"></span>
            </span>
          </button>
          <button onClick={() => { setShowVTT(!showVTT); if (!showVTT) setShowWhiteboard(false); }} className={`relative group p-2 cursor-pointer rounded hover:bg-[#35373c] transition-colors ${showVTT ? 'text-[#23a559]' : 'text-gray-300 hover:text-white'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
            <span className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all pointer-events-none bg-[#111214] text-[#dbdee1] text-[11px] font-bold px-3 py-1.5 rounded shadow-lg whitespace-nowrap z-50">
              {showVTT ? (t('virtual_tabletop.close') || 'Chiudi VTT') : (t('virtual_tabletop.open') || 'Apri VTT')}
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#111214]"></span>
            </span>
          </button>
          <button onClick={() => { setShowWhiteboard(!showWhiteboard); if (!showWhiteboard) setShowVTT(false); }} className={`relative group p-2 cursor-pointer rounded hover:bg-[#35373c] transition-colors ${showWhiteboard ? 'text-[#5865f2]' : 'text-gray-300 hover:text-white'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            <span className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all pointer-events-none bg-[#111214] text-[#dbdee1] text-[11px] font-bold px-3 py-1.5 rounded shadow-lg whitespace-nowrap z-50">
              {showWhiteboard ? t('voice_room.whiteboard_off') : t('voice_room.whiteboard_on')}
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#111214]"></span>
            </span>
          </button>
          <button onClick={toggleVideo} className={`relative group p-2 cursor-pointer rounded hover:bg-[#35373c] transition-colors ${isVideoOn ? 'text-[#23a559]' : 'text-gray-300 hover:text-white'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            <span className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all pointer-events-none bg-[#111214] text-[#dbdee1] text-[11px] font-bold px-3 py-1.5 rounded shadow-lg whitespace-nowrap z-50">
              {isVideoOn ? t('voice_room.video_off') : t('voice_room.video_on')}
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#111214]"></span>
            </span>
          </button>
          <button onClick={toggleScreenSharing} className={`relative group p-2 cursor-pointer rounded hover:bg-[#35373c] transition-colors ${isScreenSharing ? 'text-[#23a559]' : 'text-gray-300 hover:text-white'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-2.25 1.25m10.5 0L15 20l-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            <span className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all pointer-events-none bg-[#111214] text-[#dbdee1] text-[11px] font-bold px-3 py-1.5 rounded shadow-lg whitespace-nowrap z-50">
              {isScreenSharing ? t('voice_room.screen_share_off') : t('voice_room.screen_share_on')}
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#111214]"></span>
            </span>
          </button>
          <button onClick={toggleMute} className={`relative group p-2 cursor-pointer rounded hover:bg-[#35373c] transition-colors ${isMuted ? 'text-[#f23f42]' : 'text-gray-300 hover:text-white'}`}>
            {isMuted ? <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" /></svg> : <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" /><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" /></svg>}
            <span className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all pointer-events-none bg-[#111214] text-[#dbdee1] text-[11px] font-bold px-3 py-1.5 rounded shadow-lg whitespace-nowrap z-50">
              {isMuted ? t('voice_room.unmute') : t('voice_room.mute')}
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#111214]"></span>
            </span>
          </button>
          <input type="file" accept=".json" ref={importInputRef} onChange={handleImportFile} className="hidden" />
          <button onClick={() => importInputRef.current?.click()} className="relative group p-2 cursor-pointer rounded text-gray-300 hover:text-white hover:bg-[#35373c]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4-4V4" transform="matrix(1 0 0 -1 0 24)" /></svg>
            <span className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all pointer-events-none bg-[#111214] text-[#dbdee1] text-[11px] font-bold px-3 py-1.5 rounded shadow-lg whitespace-nowrap z-50">
              {t('voice_room.import_chat')}
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#111214]"></span>
            </span>
          </button>
          <button onClick={() => downloadChatLog(roomId)} className="relative group p-2 cursor-pointer rounded text-gray-300 hover:text-white hover:bg-[#35373c]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4-4V4" /></svg>
            <span className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all pointer-events-none bg-[#111214] text-[#dbdee1] text-[11px] font-bold px-3 py-1.5 rounded shadow-lg whitespace-nowrap z-50">
              {t('voice_room.download_chat')}
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#111214]"></span>
            </span>
          </button>
          <button onClick={handleLeave} className="relative group p-2 cursor-pointer rounded hover:bg-[#35373c] text-[#f23f42] hover:text-[#da373c]">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" /></svg>
            <span className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all pointer-events-none bg-[#111214] text-[#dbdee1] text-[11px] font-bold px-3 py-1.5 rounded shadow-lg whitespace-nowrap z-50">
              {t('voice_room.leave_room')}
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#111214]"></span>
            </span>
          </button>
        </div>
      </div>

      {/* Dice & Import Modals */}
      {showDiceModal && (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-[#313338] rounded-xl w-full max-w-sm p-6 shadow-2xl border border-[#1e1f22]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">🎲 {t('voice_room.dice_modal.title')}</h2>
              <button onClick={() => setShowDiceModal(false)} className="text-gray-400 hover:text-white"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-2">{t('voice_room.dice_modal.num_dice')}</label>
                <input type="number" min="1" max="100" value={numDice} onChange={(e) => setNumDice(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-3 py-2 bg-[#1e1f22] text-white rounded-lg outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-2">{t('voice_room.dice_modal.dice_type')}</label>
                <select value={diceType} onChange={(e) => setDiceType(parseInt(e.target.value))} className="w-full px-3 py-2 bg-[#1e1f22] text-white rounded-lg outline-none">
                  {[4, 6, 8, 10, 12, 20, 100].map(d => <option key={d} value={d}>D{d}</option>)}
                </select>
              </div>
            </div>
            <button onClick={rollDice} className="w-full bg-[#5865f2] hover:bg-[#4752c4] text-white font-bold py-3 rounded-lg">{t('voice_room.dice_modal.roll_button')}</button>
          </div>
        </div>
      )}

      {pendingImport && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-[#313338] border border-[#1e1f22] rounded-xl shadow-2xl w-full max-w-[600px] overflow-hidden">
            <div className="p-4 border-b border-[#1e1f22] flex justify-between items-center bg-[#2b2d31]">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">Importa Chat</h2>
              <button onClick={() => setPendingImport(null)} className="text-gray-400 hover:text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-[#2b2d31] p-3 rounded-md border border-[#1e1f22] text-sm text-gray-300">
                <p><strong>File:</strong> {pendingImport.filename}</p>
                <p><strong>Messaggi:</strong> {pendingImport.count}</p>
                <p><strong>Periodo:</strong> {pendingImport.start} - {pendingImport.end}</p>
              </div>
              <button onClick={() => { setIsImporting(true); socket.emit('import-chat', { roomId, importedMessages: pendingImport.messages, overwrite: false }); setPendingImport(null); }} className="w-full py-2 px-4 bg-[#5865f2] hover:bg-[#4752c4] text-white rounded mb-2">{t('voice_room.import_modal.merge')}</button>
              <button onClick={() => { if (window.confirm(t('voice_room.import_modal.overwrite_confirm'))) { setIsImporting(true); socket.emit('import-chat', { roomId, importedMessages: pendingImport.messages, overwrite: true }); setPendingImport(null); } }} className="w-full py-2 px-4 bg-[#da373c] hover:bg-[#c02026] text-white rounded">{t('voice_room.import_modal.overwrite')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="hidden">
        {Object.entries(remoteStreams).map(([id, stream]) => (
          <AudioStream 
            key={id} 
            stream={stream} 
            volume={remoteUserSettings[id]?.volume ?? 1} 
            muted={remoteUserSettings[id]?.muted ?? false} 
          />
        ))}
      </div>
    </div>
  );
};

export default VoiceRoom;
