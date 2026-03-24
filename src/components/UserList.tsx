'use client';

import React from 'react';

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
  return (
    <div className="sidebar w-64 flex-shrink-0 flex flex-col h-full border-r border-[#1e1f22]">
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
    </div>
  );
};

export default UserList;
