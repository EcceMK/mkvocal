export interface ChatToken {
  type: 'text' | 'link';
  content: string;
}

export const parseLinks = (text: string): ChatToken[] => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.filter(p => p !== '').map(p => {
    if (p.match(urlRegex)) {
      return { type: 'link', content: p };
    }
    return { type: 'text', content: p };
  });
};
