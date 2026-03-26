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
  const [usersWithVideo, setUsersWithVideo] = useState<Set<string>>(new Set());
  
  const peersRef = useRef<{ [socketId: string]: RTCPeerConnection }>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const subRoomRef = useRef<'common' | 'private'>('common');
  const analysersRef = useRef<{ [socketId: string]: AnalyserNode }>({});
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    subRoomRef.current = subRoom;
  }, [subRoom]);

  const closePeer = (socketId: string) => {
    if (peersRef.current[socketId]) {
      peersRef.current[socketId].close();
      delete peersRef.current[socketId];
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
      const remoteStream = event.streams[0];
      setRemoteStreams((prev) => ({
        ...prev,
        [targetSocketId]: remoteStream,
      }));

      // Only setup audio analyser for remote stream if it has audio
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
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        socket.emit('signal', { targetSocketId, signal: pc.localDescription });
      } catch (e) {
        console.error('Error on negotiation needed', e);
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
              const pc = createPeerConnection(user.socketId, stream, true);
              peersRef.current[user.socketId] = pc;
              setPeers((prev) => [...prev, { socketId: user.socketId, pc }]);
            }
          });
          setUsersWithVideo(videoUsers);
        });

        socket.on('user-joined', ({ socketId, subRoom: joinedSubRoom, isVideoOn: userVideoOn }) => {
          if (userVideoOn) setUsersWithVideo(prev => new Set([...prev, socketId]));
          if (joinedSubRoom === subRoomRef.current) {
            const pc = createPeerConnection(socketId, stream, false);
            peersRef.current[socketId] = pc;
            setPeers((prev) => [...prev, { socketId, pc }]);
          }
        });

        socket.on('user-switched-subroom', ({ socketId, subRoom: targetSubRoom }) => {
          if (targetSubRoom === subRoomRef.current) {
            if (!peersRef.current[socketId]) {
              const pc = createPeerConnection(socketId, stream, true);
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
          const pc = peersRef.current[callerId];
          if (!pc) return;

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

  const switchSubRoom = (newSubRoom: 'common' | 'private') => {
    setSubRoom(newSubRoom);
    Object.keys(peersRef.current).forEach(closePeer);
    socket.emit('switch-subroom', { subRoom: newSubRoom });
  };

  const toggleVideo = async () => {
    if (!localStreamRef.current) return;

    if (!isVideoOn) {
      try {
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

  return { localStream, remoteStreams, peers, subRoom, switchSubRoom, speakingUsers, isVideoOn, toggleVideo, usersWithVideo };
};
