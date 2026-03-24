'use client';

import React, { useState } from 'react';

interface JoinRoomProps {
  onJoin: (username: string, roomId: string) => void;
}

const JoinRoom: React.FC<JoinRoomProps> = ({ onJoin }) => {
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
        <h1 className="text-3xl font-bold text-center mb-8 text-white">mkvocal</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-400 mb-2 uppercase tracking-wider">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-3 rounded bg-[#1e1f22] border-none focus:ring-2 focus:ring-[#5865f2] text-white outline-none transition-all"
              placeholder="Enter your username"
              required
            />
          </div>
          <div>
            <label htmlFor="roomId" className="block text-sm font-medium text-gray-400 mb-2 uppercase tracking-wider">
              Room ID
            </label>
            <input
              type="text"
              id="roomId"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full p-3 rounded bg-[#1e1f22] border-none focus:ring-2 focus:ring-[#5865f2] text-white outline-none transition-all"
              placeholder="Enter room ID"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full btn-primary text-lg py-3 mt-4 hover:shadow-lg transition-all"
          >
            Join Room
          </button>
        </form>
      </div>
    </div>
  );
};

export default JoinRoom;
