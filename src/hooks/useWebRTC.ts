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
  const [subRoom, setSubRoom] = useState<'common' | 'private'>('common');
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [usersWithVideo, setUsersWithVideo] = useState<Set<string>>(new Set());
  
  const peersRef = useRef<{ [socketId: string]: RTCPeerConnection }>({});
  const makingOfferRef = useRef<{ [socketId: string]: boolean }>({});
  const ignoreOfferRef = useRef<{ [socketId: string]: boolean }>({});
  const peerUserIdsRef = useRef<{ [socketId: string]: string }>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const subRoomRef = useRef<'common' | 'private'>('common');
  const analysersRef = useRef<{ [socketId: string]: AnalyserNode }>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    subRoomRef.current = subRoom;
  }, [subRoom]);

  const closePeer = (socketId: string) => {
    if (peersRef.current[socketId]) {
      peersRef.current[socketId].close();
      delete peersRef.current[socketId];
      delete makingOfferRef.current[socketId];
      delete ignoreOfferRef.current[socketId];
      delete peerUserIdsRef.current[socketId];
      if (analysersRef.current[socketId]) {
        delete analysersRef.current[socketId];
      }
      setPeers((prev) => prev.filter((p) => p.socketId !== socketId));
      setRemoteStreams((prev) => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
    }
  };

  const createPeerConnection = (targetSocketId: string, targetUserId: string, stream: MediaStream) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    peerUserIdsRef.current[targetSocketId] = targetUserId;
    const polite = userId < targetUserId;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('signal', { targetSocketId, signal: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      setRemoteStreams((prev) => ({
        ...prev,
        [targetSocketId]: remoteStream,
      }));

      if (event.track.kind === 'audio' && audioContextRef.current) {
        const source = audioContextRef.current.createMediaStreamSource(remoteStream);
        const analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analysersRef.current[targetSocketId] = analyser;
      }
    };

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onnegotiationneeded = async () => {
      try {
        if (makingOfferRef.current[targetSocketId] || pc.signalingState !== 'stable') return;
        makingOfferRef.current[targetSocketId] = true;
        await pc.setLocalDescription();
        socket.emit('signal', { targetSocketId, signal: pc.localDescription });
      } catch (err) {
        console.error('Error on negotiation needed:', err);
      } finally {
        makingOfferRef.current[targetSocketId] = false;
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce();
      }
    };

    return pc;
  };

  useEffect(() => {
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        
        setLocalStream(stream);
        localStreamRef.current = stream;

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;
        
        const localSource = audioCtx.createMediaStreamSource(stream);
        const localAnalyser = audioCtx.createAnalyser();
        localSource.connect(localAnalyser);
        analysersRef.current['local'] = localAnalyser;

        socket.emit('join-room', { roomId, userId, username, subRoom: subRoomRef.current });

        socket.on('all-users', (users) => {
          const videoUsers = new Set<string>();
          users.forEach((user: any) => {
            if (user.isVideoOn) videoUsers.add(user.socketId);
            if (user.subRoom === subRoomRef.current) {
              const pc = createPeerConnection(user.socketId, user.userId, stream);
              peersRef.current[user.socketId] = pc;
              setPeers((prev) => [...prev, { socketId: user.socketId, pc }]);
            }
          });
          setUsersWithVideo(videoUsers);
        });

        socket.on('user-joined', ({ socketId, userId: joinedUserId, subRoom: joinedSubRoom, isVideoOn: userVideoOn }) => {
          if (userVideoOn) setUsersWithVideo(prev => new Set([...prev, socketId]));
          if (joinedSubRoom === subRoomRef.current) {
            const pc = createPeerConnection(socketId, joinedUserId, stream);
            peersRef.current[socketId] = pc;
            setPeers((prev) => [...prev, { socketId, pc }]);
          }
        });

        socket.on('user-switched-subroom', ({ socketId, userId: targetUserId, subRoom: targetSubRoom }) => {
          if (targetSubRoom === subRoomRef.current) {
            if (!peersRef.current[socketId]) {
              const pc = createPeerConnection(socketId, targetUserId, stream);
              peersRef.current[socketId] = pc;
              setPeers((prev) => [...prev, { socketId, pc }]);
            }
          } else {
            closePeer(socketId);
          }
        });

        socket.on('user-toggled-video', ({ socketId, isVideoOn: switchedOn }) => {
          setUsersWithVideo(prev => {
            const next = new Set(prev);
            if (switchedOn) next.add(socketId);
            else next.delete(socketId);
            return next;
          });
        });

        socket.on('signal', async ({ signal, callerId }) => {
          try {
            const pc = peersRef.current[callerId];
            if (!pc) return;

            if (signal.type === 'offer' || signal.type === 'answer') {
              // Strict guard against late/duplicate answers that arrive when we aren't expecting them
              if (signal.type === 'answer' && pc.signalingState !== 'have-local-offer') {
                return;
              }

              const targetUserId = peerUserIdsRef.current[callerId];
              const polite = userId < targetUserId;
              const offerCollision = signal.type === 'offer' && (makingOfferRef.current[callerId] || pc.signalingState !== 'stable');

              ignoreOfferRef.current[callerId] = !polite && offerCollision;
              if (ignoreOfferRef.current[callerId]) {
                return;
              }

              // Apply manual rollback if needed (polite peer encountering collision)
              if (offerCollision && polite && pc.signalingState !== 'stable') {
                try {
                  await pc.setLocalDescription({ type: 'rollback' });
                } catch (e) {
                  console.warn('Manual rollback failed (ignoring)', e);
                }
              }

              // Only accept descriptions if they won't cause immediate state errors based on our checks
              try {
                await pc.setRemoteDescription(new RTCSessionDescription(signal));
              } catch (err) {
                console.error('Failed to setRemoteDescription:', err);
                return;
              }

              if (signal.type === 'offer' && pc.signalingState === 'have-remote-offer') {
                try {
                  await pc.setLocalDescription(); // Automatically creates and sets answer
                  socket.emit('signal', { targetSocketId: callerId, signal: pc.localDescription });
                } catch (err) {
                  console.error('Failed to create/set local answer:', err);
                }
              }
            } else if (signal.candidate) {
              try {
                if (pc.remoteDescription && pc.remoteDescription.type) {
                  await pc.addIceCandidate(new RTCIceCandidate(signal));
                }
              } catch (e) {
                if (!ignoreOfferRef.current[callerId]) {
                  console.warn('Error adding ICE candidate (ignoring due to possible glare)', e);
                }
              }
            }
          } catch (err) {
            console.error('Error handling signal globally:', err);
          }
        });

        socket.on('user-left', ({ socketId }) => {
          closePeer(socketId);
          setUsersWithVideo(prev => {
            const next = new Set(prev);
            next.delete(socketId);
            return next;
          });
        });

        socket.on('room-full', () => {
          alert('Room is full (max 6 users)');
          window.location.reload();
        });

        const checkVolume = () => {
          const newSpeaking = new Set<string>();
          const dataArray = new Uint8Array(256);
          const threshold = 40;

          Object.entries(analysersRef.current).forEach(([id, analyser]) => {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const average = sum / dataArray.length;
            if (average > threshold) newSpeaking.add(id);
          });

          setSpeakingUsers(newSpeaking);
          requestAnimationFrame(checkVolume);
        };
        requestAnimationFrame(checkVolume);

      } catch (err) {
        console.error('Error accessing media devices', err);
        alert('Could not access microphone/camera. Please ensure permissions are granted.');
      }
    };

    init();

    return () => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      Object.values(peersRef.current).forEach((pc) => pc.close());
      if (audioContextRef.current) audioContextRef.current.close();
      socket.off('all-users');
      socket.off('user-joined');
      socket.off('user-switched-subroom');
      socket.off('user-toggled-video');
      socket.off('signal');
      socket.off('user-left');
      socket.off('room-full');
    };
  }, [roomId, userId, username]);

  const stopScreenSharing = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      const screenTrack = screenStreamRef.current.getVideoTracks()[0];
      if (localStreamRef.current && screenTrack) {
        localStreamRef.current.removeTrack(screenTrack);
      }
      screenStreamRef.current = null;
    }

    Object.values(peersRef.current).forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        pc.removeTrack(sender);
      }
    });

    setIsScreenSharing(false);
    setIsVideoOn(false);
    socket.emit('toggle-video', { isVideoOn: false });
  };

  const toggleScreenSharing = async () => {
    if (!localStreamRef.current) return;

    if (!isScreenSharing) {
      try {
        // Se il video della webcam è acceso, spegnilo prima
        if (isVideoOn) {
          const videoTrack = localStreamRef.current.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.stop();
            localStreamRef.current.removeTrack(videoTrack);
            Object.values(peersRef.current).forEach(pc => {
              const sender = pc.getSenders().find(s => s.track?.kind === 'video');
              if (sender) pc.removeTrack(sender);
            });
          }
        }

        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        
        localStreamRef.current.addTrack(screenTrack);
        
        Object.values(peersRef.current).forEach(pc => {
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track?.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(screenTrack);
          } else {
            pc.addTrack(screenTrack, localStreamRef.current!);
          }
        });

        screenTrack.onended = () => {
          stopScreenSharing();
        };
        
        setIsScreenSharing(true);
        setIsVideoOn(true);
        socket.emit('toggle-video', { isVideoOn: true });
      } catch (err) {
        console.error('Error starting screen share:', err);
      }
    } else {
      stopScreenSharing();
    }
  };

  const switchSubRoom = (newSubRoom: 'common' | 'private') => {
    subRoomRef.current = newSubRoom;
    setSubRoom(newSubRoom);
    Object.keys(peersRef.current).forEach(closePeer);
    socket.emit('switch-subroom', { subRoom: newSubRoom });
  };

  const toggleVideo = async () => {
    if (!localStreamRef.current) return;

    if (!isVideoOn) {
      try {
        // Se la condivisione schermo è attiva, fermala prima
        if (isScreenSharing) {
          stopScreenSharing();
        }

        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = videoStream.getVideoTracks()[0];
        localStreamRef.current.addTrack(videoTrack);
        
        Object.values(peersRef.current).forEach(pc => {
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track?.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(videoTrack);
          } else {
            pc.addTrack(videoTrack, localStreamRef.current!);
          }
        });
        
        setIsVideoOn(true);
        socket.emit('toggle-video', { isVideoOn: true });
      } catch (err) {
        console.error('Error starting video:', err);
      }
    } else {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.stop();
        localStreamRef.current.removeTrack(videoTrack);
        
        Object.values(peersRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            // Instead of removeTrack, we can replace with null to keep the transceiver
            // but removeTrack is safer for lazy-loading.
            pc.removeTrack(sender);
          }
        });
        
        setIsVideoOn(false);
        socket.emit('toggle-video', { isVideoOn: false });
      }
    }
  };

  return { localStream, remoteStreams, peers, subRoom, switchSubRoom, speakingUsers, isVideoOn, toggleVideo, usersWithVideo, isScreenSharing, toggleScreenSharing };
};
