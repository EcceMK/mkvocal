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

  const io = new Server(httpServer)

  const users = {} // socketId -> { userId, username, roomId }
  const socketToRoom = {} // socketId -> roomId

  io.on('connection', (socket) => {
    socket.on('join-room', ({ roomId, username, userId }) => {
      // Check room limit
      const roomUsers = io.sockets.adapter.rooms.get(roomId)
      const numUsers = roomUsers ? roomUsers.size : 0
      if (numUsers >= 6) {
        socket.emit('room-full')
        return
      }

      socket.join(roomId)
      users[socket.id] = { userId, username, roomId }
      socketToRoom[socket.id] = roomId

      // Get all other users in the room
      const otherUsers = []
      for (const [sId, info] of Object.entries(users)) {
        if (info.roomId === roomId && sId !== socket.id) {
          otherUsers.push({ userId: info.userId, username: info.username, socketId: sId })
        }
      }

      socket.emit('all-users', otherUsers)
      socket.to(roomId).emit('user-joined', { userId, username, socketId: socket.id })

      const roomFile = path.join(dataDir, `room_${roomId}.json`)
      if (fs.existsSync(roomFile)) {
        try {
          const history = JSON.parse(fs.readFileSync(roomFile, 'utf8'))
          socket.emit('chat-history', history)
        } catch (err) {
          console.error('Error reading chat history', err)
        }
      }
    })

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
