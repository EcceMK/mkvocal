'use client';

import React, { useState, useEffect, useRef } from 'react';
import socket from '../lib/socket';

interface Message {
  username: string;
  content: string;
  timestamp: string;
  socketId: string;
  file?: {
    name: string;
    type: string;
    data: string;
  };
}

interface ChatBoxProps {
  username: string;
}

const ChatBox: React.FC<ChatBoxProps> = ({ username }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState<{ name: string; type: string; data: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    socket.on('chat-history', (history: Message[]) => {
      setMessages(history);
    });

    socket.on('chat-message', (message: Message) => {
      setMessages((prev) => [...prev, message]);
    });

    return () => {
      socket.off('chat-history');
      socket.off('chat-message');
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const reader = new FileReader();
    reader.onload = () => {
      setFile({
        name: selected.name,
        type: selected.type,
        data: reader.result as string,
      });
    };
    reader.readAsDataURL(selected);
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() || file) {
      socket.emit('chat-message', {
        username,
        content: input.trim(),
        file: file,
      });
      setInput('');
      setFile(null);
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
            {msg.content && <p className="text-gray-300 text-sm mt-1 break-words">{msg.content}</p>}
            {msg.file && (
              <div className="mt-2">
                {msg.file.type.startsWith('image/') ? (
                  <img 
                    src={msg.file.data} 
                    alt={msg.file.name} 
                    className="max-h-[500px] max-w-full rounded cursor-pointer object-contain border border-[#1e1f22]" 
                    onClick={() => { if (msg.file) window.open(msg.file.data, '_blank') }}
                  />
                ) : (
                  <a 
                    href={msg.file.data} 
                    download={msg.file.name}
                    className="flex flex-row items-center gap-2 p-3 bg-[#1e1f22] rounded text-[#5865f2] hover:underline w-fit text-sm"
                  >
                    <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                    <span className="truncate max-w-[200px] sm:max-w-xs">{msg.file.name}</span>
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-[#313338] border-t border-[#1e1f22]">
        {file && (
          <div className="mb-2 flex items-center gap-2 bg-[#2e3035] p-2 rounded w-fit border border-[#1e1f22]">
            <span className="text-sm text-gray-300 truncate max-w-[200px]">{file.name}</span>
            <button 
              type="button" 
              onClick={() => setFile(null)} 
              className="text-red-400 hover:text-red-300 text-lg font-bold leading-none ml-2"
            >
              &times;
            </button>
          </div>
        )}
        <form onSubmit={handleSend} className="flex gap-2 items-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="scroll-p-3 bg-[#383a40] h-12 w-12 text-gray-400 hover:text-gray-200 rounded-lg transition-colors flex items-center justify-center shrink-0"
            title="Allega file"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <input
            type="file"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Messaggio..."
            className="w-full p-3 rounded-lg bg-[#383a40] text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#5865f2] transition-shadow h-12"
          />
        </form>
      </div>
    </div>
  );
};

export default ChatBox;
