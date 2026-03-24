'use client';

import React, { useState, useEffect } from 'react';

interface User {
  userId: string;
  username: string;
  socketId: string;
}

interface UserListProps {
  users: User[];
  currentUser: { userId: string; username: string } | null;
}

const UserList: React.FC<UserListProps> = ({ users, currentUser }) => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds(s => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="sidebar w-64 flex-shrink-0 flex flex-col h-full border-r border-[#1e1f22] bg-[#2b2d31]">
      <div className="p-4 border-b border-[#1e1f22]">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Users — {users.length + (currentUser ? 1 : 0)}</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {currentUser && (
          <div className="flex items-center gap-3 p-2 rounded hover:bg-[#35373c] transition-colors cursor-pointer group">
            <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-xs font-bold text-white uppercase">
              {currentUser.username[0]}
            </div>
            <div className="flex flex-col">
              <span className="text-white font-medium">{currentUser.username}</span>
              <span className="text-[10px] text-gray-400 uppercase font-bold">You</span>
            </div>
          </div>
        )}
        {users.map((user) => (
          <div key={user.socketId} className="flex items-center gap-3 p-2 rounded hover:bg-[#35373c] transition-colors cursor-pointer group">
            <div className="w-8 h-8 rounded-full bg-[#4e5058] flex items-center justify-center text-xs font-bold text-white uppercase">
              {user.username[0]}
            </div>
            <span className="text-gray-300 font-medium group-hover:text-white">{user.username}</span>
          </div>
        ))}
      </div>
      
      {/* Timer Widget */}
      <div className="p-4 border-t border-[#1e1f22] flex flex-col items-center justify-center bg-[#232428] gap-1">
        <span className="text-[10px] items-center gap-1.5 font-bold text-[#23a559] uppercase tracking-wider flex">
          <span className="w-2 h-2 rounded-full bg-[#23a559] animate-pulse"></span>
          Voice Connected
        </span>
        <span className="font-mono text-gray-200 text-lg tracking-wider font-semibold">
          {formatTime(seconds)}
        </span>
      </div>
    </div>
  );
};

export default UserList;
