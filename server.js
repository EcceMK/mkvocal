const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const { Server } = require('socket.io')
const fs = require('fs')
const path = require('path')
const os = require('os')

const dataDir = path.join(os.tmpdir(), 'mkvocal_data')
try {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
} catch (err) {
  console.error("Impossibile creare cartella data:", err)
}

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.RENDER ? '0.0.0.0' : 'localhost'
const port = process.env.PORT || 3000
const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true)
    handle(req, res, parsedUrl)
  })

  const io = new Server(httpServer, {
    maxHttpBufferSize: 1e8 // Consente invio di file e immagini fino a 100MB tramite socket
  })

  const users = {} // socketId -> { userId, username, roomId }
  const socketToRoom = {} // socketId -> roomId
  const roomWhiteboards = {} // roomId -> { [socketId]: Path[] }
  const roomBackgrounds = {} // roomId -> string
  const roomVTT = {} // roomId -> VTTPath[]
  const roomVTTBg = {} // roomId -> string
  const roomTokens = {} // roomId -> Token[]

  io.on('connection', (socket) => {
    socket.on('join-room', ({ roomId, username, userId, subRoom = 'common' }) => {
      // Check room limit
      const roomUsers = io.sockets.adapter.rooms.get(roomId)
      const numUsers = roomUsers ? roomUsers.size : 0
      if (numUsers >= 6) {
        socket.emit('room-full')
        return
      }

      socket.join(roomId)
      users[socket.id] = { userId, username, roomId, subRoom, isVideoOn: false, isWhiteboardOn: false, isVTTOn: false }
      socketToRoom[socket.id] = roomId

      // Get all other users in the room
      const otherUsers = []
      for (const [sId, info] of Object.entries(users)) {
        if (info.roomId === roomId && sId !== socket.id) {
          otherUsers.push({ userId: info.userId, username: info.username, socketId: sId, subRoom: info.subRoom, isVideoOn: info.isVideoOn || false, isWhiteboardOn: info.isWhiteboardOn || false, isVTTOn: info.isVTTOn || false })
        }
      }

      socket.emit('all-users', otherUsers)
      socket.to(roomId).emit('user-joined', { userId, username, socketId: socket.id, subRoom, isVideoOn: false, isWhiteboardOn: false, isVTTOn: false })

      // Send chat history
      const roomFile = path.join(dataDir, `room_${roomId}.json`)
      if (fs.existsSync(roomFile)) {
        try {
          const history = JSON.parse(fs.readFileSync(roomFile, 'utf8'))
          socket.emit('chat-history', history)
        } catch (err) {
          console.error('Error reading chat history', err)
        }
      }

      // Send whiteboard history
      if (roomWhiteboards[roomId]) {
        socket.emit('whiteboard-history', roomWhiteboards[roomId]);
      }
      if (roomBackgrounds[roomId]) {
        socket.emit('whiteboard-bg', roomBackgrounds[roomId]);
      }

      // Send VTT history
      if (roomVTT[roomId]) {
        socket.emit('vtt-history', roomVTT[roomId]);
      }
      if (roomVTTBg[roomId]) {
        socket.emit('vtt-bg', roomVTTBg[roomId]);
      }
      if (roomTokens[roomId]) {
        socket.emit('vtt-tokens', roomTokens[roomId]);
      }
    })

    socket.on('reconnect-room', ({ roomId, username, userId, subRoom = 'common' }) => {
      socket.join(roomId)
      users[socket.id] = { userId, username, roomId, subRoom, isVideoOn: users[socket.id]?.isVideoOn || false }
      socketToRoom[socket.id] = roomId
    })

    socket.on('switch-subroom', ({ subRoom }) => {
      const info = users[socket.id]
      if (info) {
        info.subRoom = subRoom
        io.to(info.roomId).emit('user-switched-subroom', { userId: info.userId, socketId: socket.id, subRoom })
        
        // Invia la lista degli altri utenti nella stessa sotto-stanza a chi ha appena cambiato
        const otherUsers = []
        for (const [sId, otherInfo] of Object.entries(users)) {
          if (otherInfo.roomId === info.roomId && sId !== socket.id && otherInfo.subRoom === subRoom) {
            otherUsers.push({ 
              userId: otherInfo.userId, 
              username: otherInfo.username, 
              socketId: sId, 
              subRoom: otherInfo.subRoom, 
              isVideoOn: otherInfo.isVideoOn || false, 
              isWhiteboardOn: otherInfo.isWhiteboardOn || false, 
              isVTTOn: otherInfo.isVTTOn || false 
            })
          }
        }
        socket.emit('all-users', otherUsers)
      }
    })

    socket.on('import-chat', ({ roomId, importedMessages, overwrite }) => {
      if (roomId && Array.isArray(importedMessages)) {
        const roomFile = path.join(dataDir, `room_${roomId}.json`);
        let history = [];
        if (!overwrite && fs.existsSync(roomFile)) {
          try {
            history = JSON.parse(fs.readFileSync(roomFile, 'utf8'));
          } catch (err) {}
        }

        const existingIds = new Set(history.map(m => m.id));
        const existingSignatures = new Set(history.map(m => `${m.timestamp}-${m.username}-${m.content}`));

        for (const msg of importedMessages) {
          if (msg) {
            // Se ha id e l'abbiamo già, salta
            if (msg.id && existingIds.has(msg.id)) continue;
            
            // Fila sicura per file storici vecchi (senza ID)
            const signature = `${msg.timestamp}-${msg.username}-${msg.content}`;
            if (existingSignatures.has(signature)) continue;

            // Popola ID se assente
            if (!msg.id) {
              msg.id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
            }
            
            history.push(msg);
            existingSignatures.add(signature);
          }
        }
        
        history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        try {
          fs.writeFileSync(roomFile, JSON.stringify(history));
          io.to(roomId).emit('chat-history', history);
        } catch (err) {
          console.error("Errore salvataggio import:", err);
        }
      }
    })

    socket.on('request-download', (payload) => {
      const roomId = (payload && payload.roomId) ? payload.roomId : socketToRoom[socket.id]
      if (roomId) {
        const roomFile = path.join(dataDir, `room_${roomId}.json`)
        if (fs.existsSync(roomFile)) {
          try {
            const history = fs.readFileSync(roomFile, 'utf8')
            socket.emit('chat-download-data', history)
          } catch (err) {
            console.error(err)
            socket.emit('chat-download-data', '[]')
          }
        } else {
          socket.emit('chat-download-data', '[]')
        }
      }
    })

    socket.on('toggle-video', ({ isVideoOn }) => {
      if (users[socket.id]) {
        users[socket.id].isVideoOn = isVideoOn;
        socket.to(users[socket.id].roomId).emit('user-toggled-video', { socketId: socket.id, isVideoOn });
      }
    });

    socket.on('toggle-whiteboard', ({ isWhiteboardOn }) => {
      if (users[socket.id]) {
        users[socket.id].isWhiteboardOn = isWhiteboardOn;
        socket.to(users[socket.id].roomId).emit('user-toggled-whiteboard', { socketId: socket.id, isWhiteboardOn });
      }
    });

    socket.on('toggle-vtt', ({ isVTTOn }) => {
      if (users[socket.id]) {
        users[socket.id].isVTTOn = isVTTOn;
        socket.to(users[socket.id].roomId).emit('user-toggled-vtt', { socketId: socket.id, isVTTOn });
      }
    });

    socket.on('signal', ({ targetSocketId, signal }) => {
      io.to(targetSocketId).emit('signal', { signal, callerId: socket.id })
    })

    socket.on('chat-message', (data) => {
      const roomId = socketToRoom[socket.id]
      if (roomId) {
        const msg = {
          ...data,
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          socketId: socket.id,
          timestamp: new Date().toISOString()
        }
        
        io.to(roomId).emit('chat-message', msg)

        const roomFile = path.join(dataDir, `room_${roomId}.json`)
        let history = []
        if (fs.existsSync(roomFile)) {
          try {
            history = JSON.parse(fs.readFileSync(roomFile, 'utf8'))
          } catch (err) {}
        }
        history.push(msg)
        
        try {
          fs.writeFileSync(roomFile, JSON.stringify(history))
        } catch (err) {
          console.error("Errore disko Render:", err)
        }
      }
    })

    socket.on('chat-reaction', ({ messageId, reaction, username }) => {
      const roomId = socketToRoom[socket.id]
      if (roomId) {
        const roomFile = path.join(dataDir, `room_${roomId}.json`)
        let history = []
        if (fs.existsSync(roomFile)) {
          try {
            history = JSON.parse(fs.readFileSync(roomFile, 'utf8'))
          } catch (err) {}
        }

        const msgIndex = history.findIndex(m => m.id === messageId);
        if (msgIndex !== -1) {
          if (!history[msgIndex].reactions) {
            history[msgIndex].reactions = {};
          }
          if (!history[msgIndex].reactions[reaction]) {
            history[msgIndex].reactions[reaction] = [];
          }
          const users = history[msgIndex].reactions[reaction];
          const userIndex = users.indexOf(username);
          if (userIndex !== -1) {
            users.splice(userIndex, 1);
            if (users.length === 0) {
              delete history[msgIndex].reactions[reaction];
            }
          } else {
            users.push(username);
          }

          io.to(roomId).emit('chat-message-updated', history[msgIndex]);

          try {
            fs.writeFileSync(roomFile, JSON.stringify(history))
          } catch (err) {
            console.error("Errore disko Render:", err)
          }
        }
      }
    })

    socket.on('whiteboard-draw', (data) => {
      const info = users[socket.id]
      if (info) {
        const roomId = info.roomId;
        if (!roomWhiteboards[roomId]) roomWhiteboards[roomId] = [];
        
        if (data.isNew) {
          roomWhiteboards[roomId].push({
            points: [data.point],
            color: data.color,
            width: data.width,
            tool: data.tool,
            userId: socket.id
          });
        } else {
          // Trova l'ultimo tratto inserito da questo utente e aggiornalo
          const history = roomWhiteboards[roomId];
          for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].userId === socket.id) {
              history[i].points.push(data.point);
              break;
            }
          }
        }

        socket.to(roomId).emit('whiteboard-draw', {
          ...data,
          socketId: socket.id
        });
      }
    })

    socket.on('whiteboard-clear', () => {
      const info = users[socket.id]
      if (info) {
        if (roomWhiteboards[info.roomId]) {
          roomWhiteboards[info.roomId] = roomWhiteboards[info.roomId].filter(p => p.userId !== socket.id);
        }
        socket.to(info.roomId).emit('whiteboard-clear', {
          socketId: socket.id
        });
      }
    })

    socket.on('get-whiteboard-history', () => {
      const info = users[socket.id]
      if (info) {
        if (roomWhiteboards[info.roomId]) {
          socket.emit('whiteboard-history', roomWhiteboards[info.roomId]);
        }
        if (roomBackgrounds[info.roomId]) {
          socket.emit('whiteboard-bg', roomBackgrounds[info.roomId]);
        }
      }
    })

    socket.on('whiteboard-bg', (image) => {
      const info = users[socket.id]
      if (info) {
        roomBackgrounds[info.roomId] = image;
        socket.to(info.roomId).emit('whiteboard-bg', image);
      }
    })

    socket.on('whiteboard-clear-bg', () => {
      const info = users[socket.id]
      if (info) {
        delete roomBackgrounds[info.roomId];
        socket.to(info.roomId).emit('whiteboard-bg', null);
      }
    })

    // ---- VTT events ----
    socket.on('vtt-draw', (data) => {
      const info = users[socket.id]
      if (info) {
        const roomId = info.roomId;
        if (!roomVTT[roomId]) roomVTT[roomId] = [];
        if (data.isNew) {
          roomVTT[roomId].push({
            points: [data.point],
            color: data.color,
            width: data.width,
            tool: data.tool,
            userId: socket.id,
            id: data.id
          });
        } else {
          for (let i = roomVTT[roomId].length - 1; i >= 0; i--) {
            if (roomVTT[roomId][i].id === data.id) {
              roomVTT[roomId][i].points.push(data.point);
              break;
            }
          }
        }
        socket.to(roomId).emit('vtt-draw', { ...data, socketId: socket.id });
      }
    })

    socket.on('vtt-shape', (data) => {
      const info = users[socket.id]
      if (info) {
        const roomId = info.roomId;
        if (!roomVTT[roomId]) roomVTT[roomId] = [];
        roomVTT[roomId].push({
          points: [data.start, data.end],
          color: data.color,
          width: data.width,
          tool: data.tool,
          userId: socket.id,
          id: data.id
        });
        socket.to(roomId).emit('vtt-shape', { ...data, socketId: socket.id });
      }
    })

    socket.on('vtt-clear', () => {
      const info = users[socket.id]
      if (info) {
        if (roomVTT[info.roomId]) {
          roomVTT[info.roomId] = roomVTT[info.roomId].filter(p => p.userId !== socket.id);
        }
        socket.to(info.roomId).emit('vtt-clear', { socketId: socket.id });
      }
    })

    socket.on('get-vtt-history', () => {
      const info = users[socket.id]
      if (info) {
        if (roomVTT[info.roomId]) socket.emit('vtt-history', roomVTT[info.roomId]);
        if (roomVTTBg[info.roomId]) socket.emit('vtt-bg', roomVTTBg[info.roomId]);
        if (roomTokens[info.roomId]) socket.emit('vtt-tokens', roomTokens[info.roomId]);
      }
    })

    socket.on('vtt-bg', (image) => {
      const info = users[socket.id]
      if (info) {
        roomVTTBg[info.roomId] = image;
        socket.to(info.roomId).emit('vtt-bg', image);
      }
    })

    socket.on('vtt-clear-bg', () => {
      const info = users[socket.id]
      if (info) {
        delete roomVTTBg[info.roomId];
        socket.to(info.roomId).emit('vtt-bg', null);
      }
    })

    socket.on('vtt-undo', ({ pathId }) => {
      const info = users[socket.id]
      if (info) {
        if (roomVTT[info.roomId]) {
          roomVTT[info.roomId] = roomVTT[info.roomId].filter(p => p.id !== pathId);
        }
        socket.to(info.roomId).emit('vtt-undo', { pathId });
      }
    })

    socket.on('vtt-redo', (pathData) => {
      const info = users[socket.id]
      if (info) {
        if (!roomVTT[info.roomId]) roomVTT[info.roomId] = [];
        roomVTT[info.roomId].push({ ...pathData, userId: socket.id });
        socket.to(info.roomId).emit('vtt-redo', { ...pathData, userId: socket.id });
      }
    })

    // ---- VTT Token events ----
    socket.on('vtt-token-add', (token) => {
      const info = users[socket.id]
      if (info) {
        if (!roomTokens[info.roomId]) roomTokens[info.roomId] = [];
        roomTokens[info.roomId].push(token);
        socket.to(info.roomId).emit('vtt-token-add', token);
      }
    })

    socket.on('vtt-token-move', ({ id, x, y }) => {
      const info = users[socket.id]
      if (info) {
        if (roomTokens[info.roomId]) {
          const tk = roomTokens[info.roomId].find(t => t.id === id);
          if (tk) { tk.x = x; tk.y = y; }
        }
        socket.to(info.roomId).emit('vtt-token-move', { id, x, y });
      }
    })

    socket.on('vtt-token-update', (token) => {
      const info = users[socket.id]
      if (info) {
        if (roomTokens[info.roomId]) {
          const idx = roomTokens[info.roomId].findIndex(t => t.id === token.id);
          if (idx !== -1) {
            roomTokens[info.roomId][idx] = token;
          }
        }
        socket.to(info.roomId).emit('vtt-token-update', token);
      }
    })

    socket.on('vtt-token-remove', ({ id }) => {
      const info = users[socket.id]
      if (info) {
        if (roomTokens[info.roomId]) {
          roomTokens[info.roomId] = roomTokens[info.roomId].filter(t => t.id !== id);
        }
        socket.to(info.roomId).emit('vtt-token-remove', { id });
      }
    })

    socket.on('vtt-import', (data) => {
      const info = users[socket.id];
      if (info) {
        const { roomId } = info;
        if (data.paths) roomVTT[roomId] = data.paths;
        if (data.tokens) roomTokens[roomId] = data.tokens;
        if (data.background !== undefined) roomVTTBg[roomId] = data.background;
        
        io.to(roomId).emit('vtt-history', roomVTT[roomId] || []);
        io.to(roomId).emit('vtt-tokens', roomTokens[roomId] || []);
        io.to(roomId).emit('vtt-bg', roomVTTBg[roomId] || null);
      }
    });

    socket.on('get-link-metadata', async ({ url }) => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error('Fetch failed');
        const html = await response.text();
        
        const getMeta = (prop) => {
          const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["'](?:og:|twitter:)?${prop}["'][^>]+content=["']([^"']+)["']`, 'i')) || 
                        html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:|twitter:)?${prop}["']`, 'i'));
          return match ? match[1] : null;
        };

        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        
        const metadata = {
          title: getMeta('title') || (titleMatch ? titleMatch[1] : null) || url,
          description: getMeta('description'),
          image: getMeta('image'),
          siteName: getMeta('site_name'),
          url: url
        };
        
        socket.emit('link-metadata', { url, metadata });
      } catch (err) {
        socket.emit('link-metadata', { url, metadata: null });
      }
    });

    socket.on('disconnect', () => {
      const info = users[socket.id]
      if (info) {
        const { roomId, userId } = info
        socket.to(roomId).emit('user-left', { userId, socketId: socket.id })
        delete users[socket.id]
        delete socketToRoom[socket.id]
      }
    })
  })

  httpServer
    .once('error', (err) => {
      console.error(err)
      process.exit(1)
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`)
    })
})
