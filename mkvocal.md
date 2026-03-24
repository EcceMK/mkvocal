Create a full-stack real-time communication web application using Next.js that includes both voice chat (WebRTC) and a shared group text chat.

---

## 🧠 General Goal

Build a browser-based multi-user communication app (similar to a simplified Discord) where users can:

* Join a room
* Talk via voice (WebRTC peer-to-peer)
* Send text messages in a shared group chat

Support up to ~6 users per room.

---

## ⚙️ Tech Stack

### Framework:

* Next.js (latest version, App Router or Pages Router)

### Frontend:

* React (hooks)
* Tailwind CSS

### Backend (inside Next.js):

* Socket.IO (signaling + chat)

### Realtime Media:

* WebRTC (RTCPeerConnection API)

---

## 🔊 Voice Chat Requirements

* Audio-only (no video)
* Peer-to-peer WebRTC connections
* Use STUN server:
  stun:stun.l.google.com:19302
* Each user connects to all others in the room
* Automatically establish connections when users join

---

## 💬 Text Chat Requirements

* Real-time group chat using Socket.IO
* Messages broadcast to all users in the same room
* Show:

  * username
  * message content
  * timestamp

---

## 🧩 Core Features

### 1. User प्रवेश (Join Flow)

* Input:

  * username
  * room ID
* Button: "Join Room"

---

### 2. Room System

* Users join a room via ID
* Max 6 users per room
* Maintain user list

---

### 3. Real-Time Events (Socket.IO)

Implement events:

* "join-room"
* "all-users"
* "user-joined"
* "user-left"
* "signal" (WebRTC signaling)
* "chat-message"

---

### 4. UI (React + Tailwind)

#### Layout:

* Dark theme (Discord-inspired)
* Flex layout with 2 main sections:

### LEFT PANEL

* Room info
* List of users
* Speaking indicator (optional)

### RIGHT PANEL

* Chat messages (scrollable)
* Input field + send button

### BOTTOM BAR

* Mute / Unmute button
* Leave room button

---

## 🔊 Audio Handling

* Use:
  navigator.mediaDevices.getUserMedia({ audio: true })
* Attach tracks to RTCPeerConnection
* Play incoming streams via audio elements

---

## 🔁 Peer Management

* Maintain peers map:
  userId → RTCPeerConnection
* Handle:

  * offer / answer
  * ICE candidates
* Clean up on disconnect

---

## 💬 Chat System

### Client:

* Input box to send messages
* Display message list

### Server:

* Broadcast messages to room:
  socket.to(roomId).emit("chat-message", data)

---

## 🧱 Backend (Next.js API or custom server)

* Initialize Socket.IO server inside Next.js
* Handle:

  * room join
  * user tracking
  * signaling relay
  * chat messages

---

## 📁 Suggested Structure

/app or /pages
/api/socket (Socket.IO setup)
/components
JoinForm.jsx
VoiceRoom.jsx
ChatBox.jsx
UserList.jsx
/hooks
useWebRTC.js
useSocket.js

---

## 🎨 Tailwind UI Requirements

* Dark mode:
  bg-gray-900
* Cards:
  rounded-2xl shadow-lg
* Buttons:
  green (join/unmute)
  red (leave/mute)
* Chat:
  scrollable message area
  sticky input at bottom

---

## 🔐 Edge Cases

* Handle user disconnects
* Avoid duplicate peer connections
* Limit room size to 6 users
* Handle empty rooms cleanup

---

## 🚀 Bonus Features (optional)

* Typing indicator
* Speaking detection (volume threshold)
* Mute state visible in UI
* Auto-scroll chat

---

## 📦 Output Requirements

Generate:

1. Full Next.js project
2. Working Socket.IO integration
3. WebRTC peer connection logic
4. Functional chat system
5. Tailwind styling
6. Instructions:

   * npm install
   * npm run dev

---

## ⚠️ Constraints

* No external paid services
* No media server (no SFU like mediasoup)
* Keep architecture simple and modular

---

## 🎯 Final Result

Multiple users can:

* Open the app in different tabs/devices
* Join the same room
* Talk via voice in real time
* Send and receive chat messages instantly

The app should feel like a minimal Discord clone with both voice and text communication.
