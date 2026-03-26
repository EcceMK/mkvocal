'use client';

import React, { useState } from 'react';
import { useI18n } from '../lib/i18n';

interface JoinRoomProps {
  onJoin: (username: string, roomId: string) => void;
}

const JoinRoom: React.FC<JoinRoomProps> = ({ onJoin }) => {
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim() && roomId.trim()) {
      onJoin(username, roomId);
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

          </div>
          <button
            type="submit"
            className="w-full btn-primary text-lg py-3 mt-4 hover:shadow-lg transition-all"
          >
            {t('join_room.join_button')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default JoinRoom;
