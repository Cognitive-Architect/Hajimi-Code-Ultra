/**
 * AgentChatDialog - Agent聊天对话框组件
 * 打捞来源: F:\Hajimi Code 历史版本\A2A_Demo_Skills\2.0 luxury\src\components\ui\AgentChatDialog.tsx
 * 修复: 适配新类型定义，移除旧依赖
 */

'use client';

import React, { useRef, useEffect, useState } from 'react';
import { X, Send, Bot, User, Loader2 } from 'lucide-react';
import type { AgentRole, ChatMessage } from '@/lib/ui/types';
import { getAgentDisplayName, getAgentConfig } from '@/lib/ui/types';

// Agent颜色配置 - 七权主题色
const AGENT_GRADIENTS: Record<AgentRole, string> = {
  pm: 'from-purple-600 to-purple-400',
  arch: 'from-blue-600 to-blue-400',
  qa: 'from-green-600 to-green-400',
  engineer: 'from-yellow-600 to-yellow-400',
  mike: 'from-red-600 to-red-400',
  soyorin: 'from-purple-600 to-pink-400',
};

const AGENT_BORDER_COLORS: Record<AgentRole, string> = {
  pm: 'border-purple-400 shadow-purple-500/50',
  arch: 'border-blue-400 shadow-blue-500/50',
  qa: 'border-green-400 shadow-green-500/50',
  engineer: 'border-yellow-400 shadow-yellow-500/50',
  mike: 'border-red-400 shadow-red-500/50',
  soyorin: 'border-purple-400 shadow-pink-500/50',
};

export interface AgentChatDialogProps {
  agent: AgentRole;
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (message: string) => void;
  messages: ChatMessage[];
  isLoading?: boolean;
}

export const AgentChatDialog: React.FC<AgentChatDialogProps> = ({
  agent,
  isOpen,
  onClose,
  onSendMessage,
  messages,
  isLoading = false,
}) => {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const agentConfig = getAgentConfig(agent);
  const displayName = getAgentDisplayName(agent);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSend = () => {
    if (inputValue.trim() && !isLoading) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`
        relative w-full max-w-2xl h-[80vh] max-h-[700px]
        bg-slate-900/95 rounded-2xl overflow-hidden
        border-2 ${AGENT_BORDER_COLORS[agent]}
        shadow-2xl flex flex-col
      `}>
        {/* 头部 */}
        <div className={`
          flex items-center justify-between px-6 py-4
          bg-gradient-to-r ${AGENT_GRADIENTS[agent]} bg-opacity-20
          border-b border-white/10
        `}>
          <div className="flex items-center gap-3">
            <div className={`
              w-12 h-12 rounded-full flex items-center justify-center
              bg-gradient-to-br ${AGENT_GRADIENTS[agent]}
              border-2 border-white/30 shadow-lg
            `}>
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{displayName}</h3>
              <p className="text-xs text-white/70">{agentConfig.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <X className="w-5 h-5 text-white/80" />
          </button>
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-white/50">
              <Bot className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-sm">开始与 {displayName} 对话</p>
              <p className="text-xs mt-2 opacity-60">{agentConfig.powers[0]}</p>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`flex gap-3 ${message.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`
                  w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center
                  ${message.sender === 'user' ? 'bg-slate-600' : `bg-gradient-to-br ${AGENT_GRADIENTS[agent]}`}
                `}>
                  {message.sender === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
                </div>
                <div className={`
                  max-w-[75%] rounded-2xl px-4 py-3
                  ${message.sender === 'user'
                    ? 'bg-slate-700 text-white rounded-tr-sm'
                    : `bg-gradient-to-r ${AGENT_GRADIENTS[agent]} bg-opacity-20 text-white rounded-tl-sm border border-white/10`
                  }
                `}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {message.content}
                    {message.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-white/60 animate-pulse" />}
                  </p>
                  <span className="text-xs text-white/50 mt-1 block">{formatTime(message.timestamp)}</span>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex gap-3">
              <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-gradient-to-br ${AGENT_GRADIENTS[agent]}`}>
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-white/60 animate-spin" />
                <span className="text-xs text-white/60">思考中...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入框 */}
        <div className="p-4 border-t border-white/10 bg-slate-900/80">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`发送消息给 ${displayName}...`}
              disabled={isLoading}
              className="flex-1 px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-white/30 focus:ring-2 focus:ring-white/10 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              className={`px-4 py-3 rounded-xl flex items-center justify-center bg-gradient-to-r ${AGENT_GRADIENTS[agent]} text-white font-medium disabled:opacity-50 hover:opacity-90 transition-all`}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentChatDialog;
