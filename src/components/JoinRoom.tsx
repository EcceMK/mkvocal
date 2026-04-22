'use client';

import React, { useState } from 'react';
import { useI18n } from '../lib/i18n';

interface JoinRoomProps {
  onJoin: (username: string, roomId: string, roomName: string, theme?: any) => void;
}

const JoinRoom: React.FC<JoinRoomProps> = ({ onJoin }) => {
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (username.trim() && roomId.trim()) {
      setIsLoading(true);
      try {
        const response = await fetch('/api/rooms');
        const rooms = await response.json();
        
        const room = rooms.find((r: any) => r.codice.toLowerCase() === roomId.toLowerCase());
        
        if (room) {
          onJoin(username, roomId.toLowerCase(), room.nominativo, room.theme);
        } else {
          setError(t('join_room.room_not_found'));
        }
      } catch (err) {
        console.error('Error validation room:', err);
        setError('Connection error');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="card max-w-md w-full p-8 shadow-2xl bg-[#2b2d31]">
        <h1 className="text-3xl font-bold text-center mb-8 text-white">{t('join_room.title')}</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-400 mb-2 uppercase tracking-wider">
              {t('join_room.username_label')}
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-3 rounded bg-[#1e1f22] border-none focus:ring-2 focus:ring-[#5865f2] text-white outline-none transition-all"
              placeholder={t('join_room.username_placeholder')}
              required
            />
          </div>
          <div>
            <label htmlFor="roomId" className="block text-sm font-medium text-gray-400 mb-2 uppercase tracking-wider">
              {t('join_room.room_id_label')}
            </label>
            <input
              type="text"
              id="roomId"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase())}
              className="w-full p-3 rounded bg-[#1e1f22] border-none focus:ring-2 focus:ring-[#5865f2] text-white outline-none transition-all"
              placeholder={t('join_room.room_id_placeholder')}
              required
            />
            <p className="text-xs text-gray-400 mt-2">
              {t('join_room.room_id_help')}
            </p>

          </div>
          {error && (
            <div className="p-3 rounded bg-red-500/10 border border-red-500/50 text-red-500 text-sm text-center animate-in fade-in slide-in-from-top-1">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full btn-primary text-lg py-3 mt-4 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading && <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
            {t('join_room.join_button')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default JoinRoom;
