'use client';

import { useEffect, useRef, useState } from 'react';
import socket from '../lib/socket';

interface Peer {
  socketId: string;
  pc: RTCPeerConnection;
}

export const useWebRTC = (roomId: string, userId: string, username: string) => {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<{ [socketId: string]: MediaStream }>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const peersRef = useRef<{ [socketId: string]: RTCPeerConnection }>({});
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const createPeerConnection = (targetSocketId: string, stream: MediaStream, isCaller: boolean) => {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('signal', { targetSocketId, signal: event.candidate });
        }
      };

      pc.ontrack = (event) => {
        setRemoteStreams((prev) => ({
          ...prev,
          [targetSocketId]: event.streams[0],
        }));
      };

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      if (isCaller) {
        pc.onnegotiationneeded = async () => {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('signal', { targetSocketId, signal: pc.localDescription });
          } catch (e) {
            console.error('Error on negotiation needed', e);
          }
        };
      }

      return pc;
    };

    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setLocalStream(stream);
        localStreamRef.current = stream;

        socket.emit('join-room', { roomId, userId, username });

        socket.on('all-users', (users: { socketId: string, username: string, userId: string }[]) => {
          users.forEach((user) => {
            const pc = createPeerConnection(user.socketId, stream, true);
            peersRef.current[user.socketId] = pc;
            setPeers((prev) => [...prev, { socketId: user.socketId, pc }]);
          });
        });

        socket.on('user-joined', ({ socketId }) => {
          const pc = createPeerConnection(socketId, stream, false);
          peersRef.current[socketId] = pc;
          setPeers((prev) => [...prev, { socketId, pc }]);
        });

        socket.on('signal', async ({ signal, callerId }) => {
          const pc = peersRef.current[callerId];
          
          if (!pc) {
             return;
          }

          if (signal.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('signal', { targetSocketId: callerId, signal: pc.localDescription });
          } else if (signal.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
          } else if (signal.candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(signal));
            } catch (e) {
              console.error('Error adding ice candidate', e);
            }
          }
        });

        socket.on('user-left', ({ socketId }) => {
          if (peersRef.current[socketId]) {
            peersRef.current[socketId].close();
            delete peersRef.current[socketId];
            setPeers((prev) => prev.filter((p) => p.socketId !== socketId));
            setRemoteStreams((prev) => {
              const next = { ...prev };
              delete next[socketId];
              return next;
            });
          }
        });

        socket.on('room-full', () => {
          alert('Room is full (max 6 users)');
          window.location.reload();
        });
      } catch (err) {
        console.error('Error accessing microphone', err);
        alert('Could not access microphone. Please ensure permissions are granted.');
      }
    };

    init();

    const currentPeersRef = peersRef.current;
    const currentLocalStreamRef = localStreamRef.current;

    return () => {
      currentLocalStreamRef?.getTracks().forEach((track) => track.stop());
      Object.values(currentPeersRef).forEach((pc) => pc.close());
      socket.off('all-users');
      socket.off('user-joined');
      socket.off('signal');
      socket.off('user-left');
      socket.off('room-full');
    };
  }, [roomId, userId, username]);

  return { localStream, remoteStreams, peers };
};
