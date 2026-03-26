'use client';

import React, { useState, useEffect, useRef } from 'react';
import UserList from './UserList';
import ChatBox from './ChatBox';
import AudioStream from './AudioStream';
import { useWebRTC } from '../hooks/useWebRTC';
import socket from '../lib/socket';
import { downloadChatLog } from '@/lib/downloadChatLog';
import { useI18n } from '../lib/i18n';

interface VoiceRoomProps {
  username: string;
  roomId: string;
  userId: string;
  onLeave: () => void;
}

const VoiceRoom: React.FC<VoiceRoomProps> = ({ username, roomId, userId, onLeave }) => {
  const { t } = useI18n();
  const [users, setUsers] = useState<{ userId: string; username: string; socketId: string; subRoom?: string }[]>([]);
  const { localStream, remoteStreams, subRoom, switchSubRoom, speakingUsers } = useWebRTC(roomId, userId, username);
  const [isMuted, setIsMuted] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ messages: any[], filename: string, count: number, start: string, end: string } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        if (Array.isArray(json)) {
          const count = json.length;
          let start = 'N/D';
          let end = 'N/D';
          if (count > 0) {
            const sorted = [...json].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            if (sorted[0]?.timestamp) start = new Date(sorted[0].timestamp).toLocaleDateString([], { hour: '2-digit', minute: '2-digit' });
            if (sorted[count - 1]?.timestamp) end = new Date(sorted[count - 1].timestamp).toLocaleDateString([], { hour: '2-digit', minute: '2-digit' });
          }
          setPendingImport({
            messages: json,
            filename: file.name,
            count,
            start,
            end
          });
        } else {
          alert(t('voice_room.json_invalid'));
        }
      } catch (err) {
        alert(t('voice_room.json_error'));
      }
    };
    reader.readAsText(file);

    if (importInputRef.current) {
      importInputRef.current.value = '';
    }
  };

  useEffect(() => {
    socket.on('all-users', (allUsers) => setUsers(allUsers));
    socket.on('user-joined', (user) => setUsers((prev) => [...prev, user]));
    socket.on('user-left', ({ socketId }) => setUsers((prev) => prev.filter((u) => u.socketId !== socketId)));

    socket.on('user-switched-subroom', ({ socketId, subRoom: newSubRoom }) => {
      setUsers((prev) => prev.map((u) => (u.socketId === socketId ? { ...u, subRoom: newSubRoom } : u)));
    });

    const handleReconnect = () => {
      socket.emit('reconnect-room', { roomId, userId, username, subRoom });
    };
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('all-users');
      socket.off('user-joined');
      socket.off('user-switched-subroom');
      socket.off('connect', handleReconnect);
    };
  }, [roomId, userId, username, subRoom]);

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

  const [showDiceModal, setShowDiceModal] = useState(false);
  const [numDice, setNumDice] = useState(1);
  const [diceType, setDiceType] = useState(20);

  const rollDice = () => {
    const results = [];
    let sum = 0;
    for (let i = 0; i < numDice; i++) {
      const roll = Math.floor(Math.random() * diceType) + 1;
      results.push(roll);
      sum += roll;
    }

    let content = `(${numDice} d${diceType}) Lancio di ${username} -> [ ${results.join(', ')} ]`;
    if (numDice > 1) {
      content += ` = ${sum}`;
    }

    socket.emit('chat-message', {
      username: '🎲 ' + username,
      content: content,
    });

    setShowDiceModal(false);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#313338] text-[#f2f3f5]">
      {/* Sidebar */}
      <UserList 
        users={users} 
        currentUser={{ userId, username, subRoom, isSpeaking: speakingUsers.has('local') }} 
        speakingUsers={speakingUsers}
      />

      {/* Main Content */}
      <div className="flex flex-col flex-1 h-full">
        {/* Header */}
        <div className="h-12 flex items-center px-4 shadow-sm border-b border-[#1e1f22]">
          <span className="font-bold text-gray-400 mr-2">#</span>
          <span className="font-semibold text-white">{roomId}</span>
        </div>

        {/* Chat Area */}
        <ChatBox username={username} />

        {/* Bottom Bar */}
        <div className="h-16 bg-[#232428] flex items-center justify-between px-4 mt-auto border-t border-[#1e1f22]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-xs font-bold text-white uppercase">
              {username[0]}
            </div>
            <div className="flex flex-col">
              <span className="text-[13px] font-bold leading-tight">{username}</span>
              <span className="text-[11px] text-gray-400">{t('voice_room.online')}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDiceModal(true)}
              className="p-2 rounded hover:bg-[#35373c] text-gray-300 hover:text-white transition-colors flex items-center justify-center shrink-0"
              title={t('voice_room.roll_dice')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2" /><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor" /><circle cx="15.5" cy="8.5" r="1.5" fill="currentColor" /><circle cx="8.5" cy="15.5" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></svg>
            </button>
            <button
              onClick={() => switchSubRoom(subRoom === 'common' ? 'private' : 'common')}
              className={`p-2 rounded hover:bg-[#35373c] group transition-colors flex items-center justify-center ${subRoom === 'private' ? 'text-[#5865f2]' : 'text-gray-300 hover:text-white'}`}
              title={subRoom === 'private' ? t('voice_room.exit_private') : t('voice_room.enter_private')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </button>
            <button
              onClick={toggleMute}
              className={`p-2 rounded hover:bg-[#35373c] group transition-colors flex items-center justify-center ${isMuted ? 'text-[#f23f42]' : 'text-gray-300 hover:text-white'}`}
              title={isMuted ? t('voice_room.unmute') : t('voice_room.mute')}
            >
              {isMuted ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" /><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" /></svg>
              )}
            </button>
            <input
              type="file"
              accept=".json"
              ref={importInputRef}
              onChange={handleImportFile}
              className="hidden"
            />
            <button
              onClick={() => importInputRef.current?.click()}
              className={`p-2 rounded transition-colors flex items-center justify-center shrink-0 text-gray-300 hover:text-white hover:bg-[#35373c]`}
              title={t('voice_room.import_chat')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4-4V4" transform="matrix(1 0 0 -1 0 24)" /></svg>
            </button>
            {/* tasto di download con token */}
            <button
              onClick={() => downloadChatLog(roomId)}
              className={`p-2 rounded transition-colors flex items-center justify-center shrink-0 text-gray-300 hover:text-white hover:bg-[#35373c]`}
              title={t('voice_room.download_chat')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <button
              onClick={handleLeave}
              className="p-2 rounded hover:bg-[#35373c] text-[#f23f42] hover:text-[#da373c] transition-colors"
              title={t('voice_room.leave_room')}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Remote Audio Players (Invisible) */}
      <div className="hidden">
        {Object.entries(remoteStreams).map(([socketId, stream]) => (
          <AudioStream key={socketId} stream={stream} />
        ))}
      </div>

      {showDiceModal && (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-50 p-4">
          <div className="bg-[#313338] rounded-xl w-full max-w-sm p-6 shadow-2xl border border-[#1e1f22]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <svg className="w-6 h-6 text-[#5865f2]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2" /><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor" /><circle cx="15.5" cy="8.5" r="1.5" fill="currentColor" /><circle cx="8.5" cy="15.5" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></svg>
                {t('voice_room.dice_modal.title')}
              </h2>
              <button
                onClick={() => setShowDiceModal(false)}
                className="text-gray-400 hover:text-white transition-colors p-1"
                title="Chiudi"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex flex-col gap-4 mb-6">
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-300 uppercase mb-2">{t('voice_room.dice_modal.num_dice')}</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={numDice}
                  onChange={(e) => setNumDice(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2.5 bg-[#1e1f22] text-white rounded-lg outline-none border border-transparent focus:border-[#5865f2] transition-colors mb-4"
                />
              </div>

              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-300 uppercase mb-2">{t('voice_room.dice_modal.dice_type')}</label>
                <select
                  value={diceType}
                  onChange={(e) => setDiceType(parseInt(e.target.value))}
                  className="w-full px-3 py-2.5 bg-[#1e1f22] text-white rounded-lg outline-none border border-transparent focus:border-[#5865f2] transition-colors cursor-pointer"
                >
                  <option value={4}>D4</option>
                  <option value={6}>D6</option>
                  <option value={8}>D8</option>
                  <option value={10}>D10</option>
                  <option value={12}>D12</option>
                  <option value={20}>D20</option>
                  <option value={100}>D100</option>
                </select>
              </div>
            </div>

            <button
              onClick={rollDice}
              className="w-full bg-[#5865f2] hover:bg-[#4752c4] text-white font-bold py-3 px-4 rounded-lg transition-colors flex justify-center items-center gap-2"
            >
              {t('voice_room.dice_modal.roll_button')}
            </button>
          </div>
        </div>
      )}
      {/* Import Modal */}
      {pendingImport && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-[#313338] border border-[#1e1f22] rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all">
            <div className="p-4 border-b border-[#1e1f22] flex justify-between items-center bg-[#2b2d31]">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-[#5865f2]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4 4m4-4V4" transform="matrix(1 0 0 -1 0 24)" /></svg>
                Importa Chat
              </h2>
              <button onClick={() => setPendingImport(null)} className="text-gray-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-5 space-y-4 text-gray-300">
              <div className="bg-[#2b2d31] p-3 rounded-md border border-[#1e1f22]">
                <p className="text-sm"><strong className="text-white">File:</strong> {pendingImport.filename}</p>
                <p className="text-sm mt-1"><strong className="text-white">{t('voice_room.import_modal.messages_found')}:</strong> {pendingImport.count}</p>
                <p className="text-sm mt-1"><strong className="text-white">{t('voice_room.import_modal.history')}:</strong> da {pendingImport.start} a {pendingImport.end}</p>
              </div>

              <p className="text-sm">{t('voice_room.import_modal.how_to_proceed')}</p>
            </div>

            <div className="p-4 bg-[#2b2d31] border-t border-[#1e1f22] flex flex-col gap-2">
              <button
                onClick={() => {
                  socket.emit('import-chat', { roomId, importedMessages: pendingImport.messages, overwrite: false });
                  setPendingImport(null);
                }}
                className="w-full py-2.5 px-4 bg-[#5865f2] hover:bg-[#4752c4] text-white font-medium rounded transition-colors text-sm"
              >
                {t('voice_room.import_modal.merge')}
              </button>
              <button
                onClick={() => {
                  if (window.confirm(t('voice_room.import_modal.overwrite_confirm'))) {
                    socket.emit('import-chat', { roomId, importedMessages: pendingImport.messages, overwrite: true });
                    setPendingImport(null);
                  }
                }}
                className="w-full py-2.5 px-4 bg-[#da373c] hover:bg-[#c02026] text-white font-medium rounded transition-colors text-sm"
              >
                {t('voice_room.import_modal.overwrite')}
              </button>
              <button
                onClick={() => setPendingImport(null)}
                className="w-full mt-2 py-2 px-4 hover:underline text-gray-400 hover:text-white font-medium transition-colors text-sm"
              >
                {t('voice_room.import_modal.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default VoiceRoom;
