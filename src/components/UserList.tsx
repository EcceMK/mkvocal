import React, { useState, useEffect } from 'react';
import { useI18n } from '../lib/i18n';

interface User {
  userId: string;
  username: string;
  socketId: string;
  subRoom?: string;
  isVideoOn?: boolean;
  isWhiteboardOn?: boolean;
  isVTTOn?: boolean;
}

interface RemoteUserSettings {
  volume: number;
  muted: boolean;
}

interface UserListProps {
  users: User[];
  currentUser: { userId: string; username: string; subRoom: string; isSpeaking: boolean; isVideoOn?: boolean; isWhiteboardOn?: boolean; isVTTOn?: boolean } | null;
  speakingUsers: Set<string>;
  remoteUserSettings: { [socketId: string]: RemoteUserSettings };
  onUserSettingsChange: (socketId: string, settings: Partial<RemoteUserSettings>) => void;
  onSwitchSubRoom: (subRoom: string) => void;
  isOpen: boolean;
  onClose: () => void;
  theme?: any;
}

const UserList: React.FC<UserListProps> = ({ users, currentUser, speakingUsers, remoteUserSettings, onUserSettingsChange, onSwitchSubRoom, isOpen, onClose, theme }) => {
  const { t } = useI18n();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds(s => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const commonUsers = users.filter(u => !u.subRoom || u.subRoom === 'common');
  const privateUsers = users.filter(u => u.subRoom === 'private');

  const renderUser = (user: { username: string; socketId?: string; isYou?: boolean; isSpeaking?: boolean; isVideoOn?: boolean; isWhiteboardOn?: boolean; isVTTOn?: boolean }) => {
    const isSpeaking = user.isSpeaking || (user.socketId && speakingUsers.has(user.socketId));
    const settings = user.socketId ? remoteUserSettings[user.socketId] || { volume: 1, muted: false } : null;

    return (
      <div key={user.socketId || 'you'} className="flex flex-col p-1.5 rounded hover:bg-[#35373c] transition-colors group">
        <div className="flex items-center gap-3 w-full">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white uppercase transition-all duration-200 ${isSpeaking
            ? 'bg-[#23a559] ring-2 ring-[#23a559] ring-offset-2 ring-offset-[#2b2d31] scale-110'
            : user.isYou ? 'bg-[#5865f2]' : 'bg-[#4e5058]'
            }`}>
            {user.username[0]}
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className={`font-medium transition-colors truncate ${isSpeaking ? 'text-[#23a559]' : user.isYou ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>
                {user.username}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {user.isVideoOn && (
                  <svg className="w-3.5 h-3.5 text-[#23a559]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
                {user.isWhiteboardOn && (
                  <svg className="w-3.5 h-3.5 text-[#23a559]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                )}
                {user.isVTTOn && (
                  <svg className="w-3.5 h-3.5 text-[#5865f2]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16M9 4v16M15 4v16M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                )}
                {!user.isYou && user.socketId && (
                  <button 
                    onClick={() => onUserSettingsChange(user.socketId!, { muted: !settings?.muted })}
                    className={`p-1 rounded hover:bg-[#404249] transition-colors ml-1 ${settings?.muted ? 'text-[#f23f42]' : 'text-gray-400 hover:text-white'}`}
                    title={settings?.muted ? t('user_list.unmute_user') : t('user_list.mute_user')}
                  >
                    {settings?.muted ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                    )}
                  </button>
                )}
              </div>
            </div>
            {user.isYou && <span className="text-[10px] text-gray-400 uppercase font-bold">{t('user_list.you')}</span>}
          </div>
        </div>
        {!user.isYou && user.socketId && (
          <div className="mt-1 pl-11 pr-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 h-0 group-hover:h-auto overflow-hidden">
             <input 
               type="range" 
               min="0" 
               max="1" 
               step="0.01" 
               value={settings?.volume ?? 1} 
               onChange={(e) => onUserSettingsChange(user.socketId!, { volume: parseFloat(e.target.value) })}
               className="flex-1 h-1 bg-[#1e1f22] rounded-lg appearance-none cursor-pointer accent-[#5865f2] hover:accent-[#4752c4]"
             />
             <span className="text-[9px] text-gray-500 font-mono w-6 text-right">{Math.round((settings?.volume ?? 1) * 100)}%</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Overlay per chiudere la sidebar (solo mobile) */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity md:hidden"
          onClick={onClose}
        />
      )}
      <div className={`sidebar z-50 transition-all duration-300 flex flex-col h-full border-r border-[#1e1f22] shrink-0 overflow-hidden
        fixed inset-y-0 left-0 w-[60%] shadow-2xl ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0 md:shadow-none md:w-64
      `} style={{ backgroundColor: theme?.sidebarBg || '#2b2d31', color: theme?.sidebarText || '#dbdee1' }}>
        <div className="flex items-center justify-between p-4 border-b border-[#1e1f22] shrink-0">
          <h2 className="text-sm font-bold uppercase tracking-widest truncate" style={{ color: theme?.sidebarText ? `${theme.sidebarText}b3` : '#9ca3af' }}>{t('user_list.members')} — {users.length + (currentUser ? 1 : 0)}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 md:hidden">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Stanza Comune */}
          <div className="space-y-2">
            <div 
              onClick={() => onSwitchSubRoom('common')}
              className={`flex items-center text-xs font-bold uppercase tracking-wider mb-2 cursor-pointer transition-colors hover:text-white ${currentUser?.subRoom === 'common' || !currentUser?.subRoom ? 'text-[#23a559]' : ''}`} 
              style={{ color: (currentUser?.subRoom === 'common' || !currentUser?.subRoom) ? '#23a559' : (theme?.sidebarText ? `${theme.sidebarText}b3` : '#9ca3af') }}
            >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
              {t('user_list.common_room')}
            </div>
            {currentUser?.subRoom === 'common' && renderUser({ username: currentUser.username, isYou: true, isSpeaking: currentUser.isSpeaking, isVideoOn: currentUser.isVideoOn, isWhiteboardOn: currentUser.isWhiteboardOn, isVTTOn: currentUser.isVTTOn })}
            {commonUsers.map((user) => renderUser({ username: user.username, socketId: user.socketId, isVideoOn: user.isVideoOn, isWhiteboardOn: user.isWhiteboardOn, isVTTOn: user.isVTTOn }))}
            {commonUsers.length === 0 && currentUser?.subRoom !== 'common' && <p className="text-[11px] text-gray-500 italic pl-2">{t('user_list.no_users')}</p>}
          </div>

          {/* Stanza Privata */}
          <div className="space-y-2">
            <div 
              onClick={() => onSwitchSubRoom('private')}
              className={`flex items-center text-xs font-bold uppercase tracking-wider mb-2 cursor-pointer transition-colors hover:text-white ${currentUser?.subRoom === 'private' ? 'text-[#5865f2]' : ''}`}
              style={{ color: currentUser?.subRoom === 'private' ? '#5865f2' : (theme?.sidebarText ? `${theme.sidebarText}b3` : '#9ca3af') }}
            >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              {t('user_list.private_room')}
            </div>
            {currentUser?.subRoom === 'private' && renderUser({ username: currentUser.username, isYou: true, isSpeaking: currentUser.isSpeaking, isVideoOn: currentUser.isVideoOn, isWhiteboardOn: currentUser.isWhiteboardOn, isVTTOn: currentUser.isVTTOn })}
            {privateUsers.map((user) => renderUser({ username: user.username, socketId: user.socketId, isVideoOn: user.isVideoOn, isWhiteboardOn: user.isWhiteboardOn, isVTTOn: user.isVTTOn }))}
            {privateUsers.length === 0 && currentUser?.subRoom !== 'private' && <p className="text-[11px] text-gray-500 italic pl-2">{t('user_list.no_users')}</p>}
          </div>
        </div>

        {/* Timer Widget */}
        <div className="p-2 border-t border-[#1e1f22] flex flex-col items-center justify-center bg-[#232428] gap-1 shrink-0">
          <span className="text-[10px] items-center gap-1.5 font-bold text-[#23a559] uppercase tracking-wider flex">
            <span className="w-2 h-2 rounded-full bg-[#23a559] animate-pulse"></span>
            {t('user_list.voice_connected')}
          </span>
          <span className="font-mono text-gray-200 text-lg tracking-wider font-semibold">
            {formatTime(seconds)}
          </span>
        </div>
      </div>
    </>
  );
};

export default UserList;
