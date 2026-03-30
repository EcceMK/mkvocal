import React, { useEffect, useState } from 'react';
import socket from '../lib/socket';

interface LinkMetadata {
  title: string;
  description: string | null;
  image: string | null;
  siteName: string | null;
  url: string;
}

interface LinkPreviewProps {
  url: string;
}

const LinkPreview: React.FC<LinkPreviewProps> = ({ url }) => {
  const [metadata, setMetadata] = useState<LinkMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const handleMetadata = (data: { url: string; metadata: LinkMetadata | null }) => {
      if (data.url === url) {
        if (data.metadata) {
          setMetadata(data.metadata);
        } else {
          setError(true);
        }
        setLoading(false);
      }
    };

    socket.on('link-metadata', handleMetadata);
    socket.emit('get-link-metadata', { url });

    return () => {
      socket.off('link-metadata', handleMetadata);
    };
  }, [url]);

  if (loading) {
    return (
      <div className="mt-2 p-3 bg-[#2b2d31] border-l-4 border-[#1e1f22] rounded flex gap-3 animate-pulse">
        <div className="w-16 h-16 bg-[#383a40] rounded shrink-0"></div>
        <div className="flex-1 space-y-2 py-1">
          <div className="h-2 bg-[#383a40] rounded w-1/2"></div>
          <div className="h-2 bg-[#383a40] rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !metadata) return null;

  return (
    <div className="mt-2 group max-w-[500px]">
      <a 
        href={url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="block bg-[#2b2d31] border-l-4 border-[#1e1f22] hover:border-[#5865f2] rounded transition-all overflow-hidden cursor-pointer"
      >
        <div className="flex flex-col sm:flex-row">
          <div className="p-3 flex-1 flex flex-col justify-center">
            {metadata.siteName && (
              <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-1 truncate">
                {metadata.siteName}
              </span>
            )}
            <h3 className="text-sm font-bold text-[#f2f3f5] mb-1 line-clamp-1 group-hover:text-[#5865f2] transition-colors">
              {metadata.title}
            </h3>
            {metadata.description && (
              <p className="text-xs text-[#dbdee1] line-clamp-2 leading-relaxed">
                {metadata.description}
              </p>
            )}
          </div>
          {metadata.image && (
            <div className="w-full sm:w-[120px] h-[120px] shrink-0 bg-[#232428]">
              <img 
                src={metadata.image} 
                alt={metadata.title} 
                className="w-full h-full object-cover" 
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            </div>
          )}
        </div>
      </a>
    </div>
  );
};

export default LinkPreview;
