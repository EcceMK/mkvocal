'use client';

import React, { useState, useEffect } from 'react';
import UserList from './UserList';
import ChatBox from './ChatBox';
import AudioStream from './AudioStream';
import { useWebRTC } from '../hooks/useWebRTC';
import socket from '../lib/socket';

interface VoiceRoomProps {
  username: string;
  roomId: string;
  userId: string;
  onLeave: () => void;
}

const VoiceRoom: React.FC<VoiceRoomProps> = ({ username, roomId, userId, onLeave }) => {
  const [users, setUsers] = useState<{ userId: string; username: string; socketId: string }[]>([]);
  const { localStream, remoteStreams } = useWebRTC(roomId, userId, username);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    socket.on('all-users', (allUsers) => setUsers(allUsers));
    socket.on('user-joined', (user) => setUsers((prev) => [...prev, user]));
    socket.on('user-left', ({ socketId }) => setUsers((prev) => prev.filter((u) => u.socketId !== socketId)));

    return () => {
      socket.off('all-users');
      socket.off('user-joined');
      socket.off('user-left');
    };
  }, []);

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

  return (
    <div className="flex h-screen overflow-hidden bg-[#313338] text-[#f2f3f5]">
      {/* Sidebar */}
      <UserList users={users} currentUser={{ userId, username }} />

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
                <span className="text-[11px] text-gray-400">Online</span>
             </div>
           </div>
           
           <div className="flex items-center gap-2">
             <button 
               onClick={toggleMute}
               className={`p-2 rounded hover:bg-[#35373c] group transition-colors flex items-center justify-center ${isMuted ? 'text-[#f23f42]' : 'text-gray-300 hover:text-white'}`}
               title={isMuted ? 'Unmute' : 'Mute'}
             >
               {isMuted ? (
                 <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>
               ) : (
                 <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
               )}
             </button>
             <button 
               onClick={handleLeave}
               className="p-2 rounded hover:bg-[#35373c] text-[#f23f42] hover:text-[#da373c] transition-colors"
               title="Leave Room"
             >
               <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>
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
    </div>
  );
};

export default VoiceRoom;
