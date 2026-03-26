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

interface VoiceRoomProps {
  username: string;
  roomId: string;
  userId: string;
  onLeave: () => void;
}

const VoiceRoom: React.FC<VoiceRoomProps> = ({ username, roomId, userId, onLeave }) => {
  const { t } = useI18n();
  const [users, setUsers] = useState<{ userId: string; username: string; socketId: string; subRoom?: string; isVideoOn?: boolean }[]>([]);
  const { localStream, remoteStreams, subRoom, switchSubRoom, speakingUsers, isVideoOn, toggleVideo, usersWithVideo } = useWebRTC(roomId, userId, username);
  const [isMuted, setIsMuted] = useState(false);
  const [messages, setMessages] = useState<{ username: string, text: string }[]>([]);
  const [inputText, setInputText] = useState('');
  const [hiddenVideos, setHiddenVideos] = useState<Set<string>>(new Set());
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showDiceModal, setShowDiceModal] = useState(false);
  const [numDice, setNumDice] = useState(1);
  const [diceType, setDiceType] = useState(20);
  const [pendingImport, setPendingImport] = useState<{ messages: any[], filename: string, count: number, start: string, end: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    socket.on('all-users', (allUsers) => setUsers(allUsers));
    socket.on('user-joined', (user) => setUsers((prev) => [...prev, user]));
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

    socket.on('chat-message', (msg) => setMessages((prev) => [...prev, msg]));

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
      socket.off('chat-message');
      socket.off('connect', handleReconnect);
    };
  }, [roomId, userId, username, subRoom]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      socket.emit('chat-message', { username, content: inputText });
      setInputText('');
    }
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
          currentUser={{ userId, username, subRoom, isSpeaking: speakingUsers.has('local'), isVideoOn }} 
          speakingUsers={speakingUsers}
        />
        
        <main className="flex-1 flex flex-col min-w-0 bg-[#313338] relative">
          {/* Header */}
          <div className="h-12 flex items-center px-4 shadow-sm border-b border-[#1e1f22] shrink-0">
            <span className="font-bold text-gray-400 mr-2">#</span>
            <span className="font-semibold text-white">{roomId}</span>
          </div>

          {/* Messages or Whiteboard */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-[#1e1f22] scrollbar-track-transparent flex flex-col">
            {showWhiteboard ? (
              <Whiteboard userId={userId} />
            ) : (
              <>
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-2">
                    <p className="text-sm font-medium">{t('voice_room.no_messages')}</p>
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div key={i} className="flex flex-col group animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-[#f2f3f5] hover:underline cursor-pointer">{msg.username}</span>
                        <span className="text-[10px] text-gray-500 font-medium">Oggi alle {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-[#dbdee1] leading-relaxed break-words">{msg.text || (msg as any).content}</p>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Floating Videos Layer */}
          <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
            <div className="pointer-events-auto contents">
              {isVideoOn && !hiddenVideos.has('local') && (
                <FloatingVideo
                  stream={localStream}
                  username={username}
                  isLocal={true}
                  isSpeaking={speakingUsers.has('local')}
                  onClose={() => setHiddenVideos(prev => new Set([...prev, 'local']))}
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
          {!showWhiteboard && (
            <div className="p-4 bg-[#313338] shrink-0">
              <form onSubmit={sendMessage} className="relative group">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={t('voice_room.message_placeholder')}
                  className="w-full bg-[#383a40] text-[#dbdee1] rounded-lg px-4 py-3 pr-12 focus:outline-none focus:ring-1 focus:ring-[#5865f2] transition-all"
                />
                <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white transition-colors">
                  <svg className="w-5 h-5 rotate-90" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                </button>
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
          <button onClick={() => setShowDiceModal(true)} className="p-2 rounded hover:bg-[#35373c] text-gray-300 hover:text-white transition-colors" title={t('voice_room.roll_dice')}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2" /><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor" /><circle cx="15.5" cy="8.5" r="1.5" fill="currentColor" /><circle cx="8.5" cy="15.5" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></svg>
          </button>
          <button onClick={() => switchSubRoom(subRoom === 'common' ? 'private' : 'common')} className={`p-2 rounded hover:bg-[#35373c] transition-colors ${subRoom === 'private' ? 'text-[#5865f2]' : 'text-gray-300 hover:text-white'}`} title={subRoom === 'private' ? t('voice_room.exit_private') : t('voice_room.enter_private')}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </button>
          <button onClick={() => setShowWhiteboard(!showWhiteboard)} className={`p-2 rounded hover:bg-[#35373c] transition-colors ${showWhiteboard ? 'text-[#5865f2]' : 'text-gray-300 hover:text-white'}`} title={showWhiteboard ? t('voice_room.whiteboard_off') : t('voice_room.whiteboard_on')}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          </button>
          <button onClick={toggleVideo} className={`p-2 rounded hover:bg-[#35373c] transition-colors ${isVideoOn ? 'text-[#23a559]' : 'text-gray-300 hover:text-white'}`} title={isVideoOn ? t('voice_room.video_off') : t('voice_room.video_on')}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </button>
          <button onClick={toggleMute} className={`p-2 rounded hover:bg-[#35373c] transition-colors ${isMuted ? 'text-[#f23f42]' : 'text-gray-300 hover:text-white'}`} title={isMuted ? t('voice_room.unmute') : t('voice_room.mute')}>
            {isMuted ? <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" /></svg> : <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" /><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" /></svg>}
          </button>
          <input type="file" accept=".json" ref={importInputRef} onChange={handleImportFile} className="hidden" />
          <button onClick={() => importInputRef.current?.click()} className="p-2 rounded text-gray-300 hover:text-white hover:bg-[#35373c]" title={t('voice_room.import_chat')}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4-4V4" transform="matrix(1 0 0 -1 0 24)" /></svg>
          </button>
          <button onClick={() => downloadChatLog(roomId)} className="p-2 rounded text-gray-300 hover:text-white hover:bg-[#35373c]" title={t('voice_room.download_chat')}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4-4V4" /></svg>
          </button>
          <button onClick={handleLeave} className="p-2 rounded hover:bg-[#35373c] text-[#f23f42] hover:text-[#da373c]" title={t('voice_room.leave_room')}>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" /></svg>
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
          <div className="bg-[#313338] border border-[#1e1f22] rounded-xl shadow-2xl w-full max-md overflow-hidden">
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
              <button onClick={() => { socket.emit('import-chat', { roomId, importedMessages: pendingImport.messages, overwrite: false }); setPendingImport(null); }} className="w-full py-2 px-4 bg-[#5865f2] hover:bg-[#4752c4] text-white rounded mb-2">{t('voice_room.import_modal.merge')}</button>
              <button onClick={() => { if (window.confirm(t('voice_room.import_modal.overwrite_confirm'))) { socket.emit('import-chat', { roomId, importedMessages: pendingImport.messages, overwrite: true }); setPendingImport(null); } }} className="w-full py-2 px-4 bg-[#da373c] hover:bg-[#c02026] text-white rounded">{t('voice_room.import_modal.overwrite')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="hidden">
        {Object.entries(remoteStreams).map(([id, stream]) => (
          <AudioStream key={id} stream={stream} />
        ))}
      </div>
    </div>
  );
};

export default VoiceRoom;
