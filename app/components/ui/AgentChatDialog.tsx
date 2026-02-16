/**
 * AgentChatDialog - Agent聊天对话框组件 (v2人格化版)
 * 打捞来源: F:\Hajimi Code 历史版本\A2A_Demo_Skills\2.0 luxury\src\components\ui\AgentChatDialog.tsx
 * 修复: 适配新类型定义，移除旧依赖
 * 升级: v2添加发信人头像+主题色气泡+角色署名
 */

'use client';

import React, { useRef, useEffect, useState } from 'react';
import { X, Send, Bot, User, Loader2, Drum } from 'lucide-react';
import type { AgentRole, ChatMessage } from '@/lib/ui/types';
import { getAgentDisplayName, getAgentConfig, AGENT_DISPLAY_CONFIG } from '@/lib/ui/types';

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

// 消息气泡样式配置 - 根据Agent角色显示主题色
const MESSAGE_BUBBLE_STYLES: Record<AgentRole, string> = {
  // 客服小祥 - 深紫色主题
  pm: 'border-l-4 border-[#884499] bg-purple-900/20 hover:bg-purple-900/30',
  // 压力怪(arch/taki) - 深蓝色主题
  arch: 'border-l-4 border-[#7777AA] bg-blue-900/20 hover:bg-blue-900/30',
  // 咕咕嘎嘎 - 绿色主题
  qa: 'border-l-4 border-[#66BB66] bg-green-900/20 hover:bg-green-900/30',
  // 奶龙娘 - 黄色主题
  engineer: 'border-l-4 border-[#FFDD88] bg-yellow-900/20 hover:bg-yellow-900/30',
  // Mike - 红色主题
  mike: 'border-l-4 border-[#EE6677] bg-red-900/20 hover:bg-red-900/30',
  // Soyorin - 紫粉色主题
  soyorin: 'border-l-4 border-[#AA66AA] bg-pink-900/20 hover:bg-pink-900/30',
};

// 头像背景色配置
const AVATAR_BG_STYLES: Record<AgentRole, string> = {
  pm: 'bg-[#884499] shadow-purple-500/50',
  arch: 'bg-[#7777AA] shadow-blue-500/50',
  qa: 'bg-[#66BB66] shadow-green-500/50',
  engineer: 'bg-[#FFAA44] shadow-yellow-500/50',
  mike: 'bg-[#EE6677] shadow-red-500/50',
  soyorin: 'bg-[#AA66AA] shadow-pink-500/50',
};

// 获取消息样式
const getMessageStyle = (sender: AgentRole | 'user'): string => {
  if (sender === 'user') {
    return 'bg-slate-700 border-l-4 border-slate-500';
  }
  return MESSAGE_BUBBLE_STYLES[sender] || 'border-l-4 border-gray-500 bg-slate-800';
};

// 获取头像样式
const getAvatarStyle = (sender: 'user' | 'agent', agent?: AgentRole): string => {
  if (sender === 'user') {
    return 'bg-slate-600';
  }
  return agent ? (AVATAR_BG_STYLES[agent] || 'bg-gray-600') : 'bg-gradient-to-br from-purple-500 to-blue-500';
};

// 获取Agent图标
const getAgentIcon = (role: AgentRole): string => {
  return AGENT_DISPLAY_CONFIG[role]?.icon || '🤖';
};

// 判断是否需要显示角色署名 (客服小祥)
const showSignature = (sender: 'user' | 'agent', agent?: AgentRole): boolean => {
  return agent === 'pm';
};

// 判断是否需要显示鼓点图标 (压力怪/审计)
const showDrumIcon = (sender: AgentRole | 'user'): boolean => {
  return sender === 'arch';
};

// 获取署名文本
const getSignatureText = (sender: AgentRole | 'user'): string => {
  if (sender === 'pm') return '— 客服小祥';
  if (sender === 'arch') return '— 压力怪';
  if (sender === 'qa') return '— 咕咕嘎嘎';
  if (sender === 'engineer') return '— 奶龙娘';
  if (sender === 'mike') return '— Mike';
  if (sender === 'soyorin') return '— Soyorin';
  return '';
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
              <div 
                key={message.id} 
                className={`flex gap-3 ${message.sender === 'user' ? 'flex-row-reverse' : ''}`}
              >
                {/* 左侧头像栏 */}
                <div className={`
                  w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center
                  shadow-lg transition-transform hover:scale-110
                  ${getAvatarStyle(message.sender, agent)}
                `}>
                  {message.sender === 'user' ? (
                    <User className="w-5 h-5 text-white" />
                  ) : (
                    <span className="text-lg">{getAgentIcon(message.sender as AgentRole)}</span>
                  )}
                </div>
                
                {/* 消息气泡 */}
                <div className="flex flex-col max-w-[75%]">
                  <div className={`
                    rounded-2xl px-4 py-3 transition-all
                    ${message.sender === 'user'
                      ? 'bg-slate-700 text-white rounded-tr-sm'
                      : `text-white rounded-tl-sm ${getMessageStyle(message.sender as AgentRole)}`
                    }
                  `}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {message.content}
                      {message.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-white/60 animate-pulse" />}
                    </p>
                  </div>
                  
                  {/* 底部元信息栏 */}
                  <div className={`flex items-center gap-2 mt-1.5 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {/* 时间戳 */}
                    <span className="text-xs text-white/40">
                      {formatTime(message.timestamp)}
                    </span>
                    
                    {/* 角色署名 - 客服小祥显示署名 */}
                    {message.sender !== 'user' && showSignature(message.sender, agent) && (
                      <span className="text-xs text-[#884499] font-medium italic">
                        {getSignatureText(message.sender as AgentRole)}
                      </span>
                    )}
                    
                    {/* 鼓点图标 - 压力怪审计显示 */}
                    {message.sender !== 'user' && showDrumIcon(message.sender as AgentRole) && (
                      <div className="flex items-center gap-1 text-[#7777AA]">
                        <Drum className="w-3 h-3 animate-bounce" />
                        <span className="text-xs font-medium">审计中...</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex gap-3">
              <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center shadow-lg ${AVATAR_BG_STYLES[agent]}`}>
                <span className="text-lg">{getAgentIcon(agent)}</span>
              </div>
              <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 border border-white/10">
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
