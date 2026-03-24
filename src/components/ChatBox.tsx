'use client';

import React, { useState, useEffect, useRef } from 'react';
import socket from '../lib/socket';

interface Message {
  username: string;
  content: string;
  timestamp: string;
  socketId: string;
}

interface ChatBoxProps {
  username: string;
}

const ChatBox: React.FC<ChatBoxProps> = ({ username }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    socket.on('chat-message', (message: Message) => {
      setMessages((prev) => [...prev, message]);
    });

    return () => {
      socket.off('chat-message');
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      socket.emit('chat-message', {
        username,
        content: input.trim(),
      });
      setInput('');
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full bg-[#313338]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className="flex flex-col hover:bg-[#2e3035] p-1 rounded">
            <div className="flex items-baseline gap-2">
              <span className="text-[#5865f2] font-semibold text-sm cursor-pointer hover:underline">
                {msg.username}
              </span>
              <span className="text-[10px] text-gray-500 font-medium">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-gray-300 text-sm mt-1">{msg.content}</p>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSend} className="p-4 bg-[#313338] border-t border-[#1e1f22]">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Message...`}
          className="w-full p-3 rounded-lg bg-[#383a40] text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#5865f2] transition-shadow"
        />
      </form>
    </div>
  );
};

export default ChatBox;
