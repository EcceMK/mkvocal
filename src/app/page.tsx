'use client';

import React, { useState } from 'react';
import JoinRoom from '../components/JoinRoom';
import VoiceRoom from '../components/VoiceRoom';

export default function Home() {
  const [joined, setJoined] = useState(false);
  const [roomData, setRoomData] = useState<{ username: string; roomId: string; userId: string; roomName: string, theme?: any } | null>(null);

  const handleJoin = (username: string, roomId: string, roomName: string, theme?: any) => {
    const userId = Math.random().toString(36).substring(2, 9);
    setRoomData({ username, roomId, userId, roomName, theme });
    setJoined(true);
  };

  const handleLeave = () => {
    setJoined(false);
    setRoomData(null);
  };

  return (
    <main className="min-h-screen">
      {!joined ? (
        <JoinRoom onJoin={handleJoin} />
      ) : (
        roomData && (
          <VoiceRoom
            username={roomData.username}
            roomId={roomData.roomId}
            userId={roomData.userId}
            roomName={roomData.roomName}
            theme={roomData.theme}
            onLeave={handleLeave}
          />
        )
      )}
    </main>
  );
}
