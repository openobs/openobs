import React from 'react';

interface ChatBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export function ChatBubble({ role, content, timestamp }: ChatBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div
          className={`px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'bg-[var(--color-primary)] text-white rounded-2xl rounded-br-sm'
              : 'bg-[var(--color-surface-high)] text-[var(--color-on-surface)] rounded-2xl rounded-bl-sm'
          }`}
        >
          {content}
        </div>
        {timestamp && (
          <span className="text-[var(--color-outline)] text-xs px-1">{timestamp}</span>
        )}
      </div>
    </div>
  );
}
