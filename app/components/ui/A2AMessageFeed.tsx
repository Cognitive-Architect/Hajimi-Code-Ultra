/**
 * A2AMessageFeed - A2A消息流Feed组件
 * 打捞来源: F:\Hajimi Code 历史版本\A2A_Demo_Skills\2.0 luxury\src\components\ui\A2AMessageFeed.tsx
 * 修复: 适配新类型定义，简化过滤器
 */

'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { 
  AgentRole, A2AMessage, A2AMessageType, 
  AGENT_ROLES, MESSAGE_TYPES, getAgentDisplayName 
} from '@/lib/ui/types';
import { 
  Filter, MessageSquare, CheckCircle, XCircle, 
  Play, Check, Radio, AlertCircle, Clock, Send, RefreshCw 
} from 'lucide-react';

const AGENT_COLORS: Record<AgentRole, string> = {
  pm: 'bg-purple-500',
  arch: 'bg-blue-500',
  qa: 'bg-green-500',
  engineer: 'bg-yellow-500',
  mike: 'bg-red-500',
  soyorin: 'bg-pink-500',
};

const MESSAGE_TYPE_ICONS: Record<A2AMessageType, React.ElementType> = {
  proposal: Send,
  review: MessageSquare,
  approve: CheckCircle,
  reject: XCircle,
  execute: Play,
  complete: Check,
  chat: MessageSquare,
  broadcast: Radio,
  system: AlertCircle,
};

const MESSAGE_TYPE_COLORS: Record<A2AMessageType, string> = {
  proposal: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  review: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  approve: 'text-green-400 bg-green-400/10 border-green-400/30',
  reject: 'text-red-400 bg-red-400/10 border-red-400/30',
  execute: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  complete: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  chat: 'text-slate-400 bg-slate-400/10 border-slate-400/30',
  broadcast: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
  system: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30',
};

const MESSAGE_TYPE_LABELS: Record<A2AMessageType, string> = {
  proposal: '提案', review: '审查', approve: '批准', reject: '拒绝',
  execute: '执行', complete: '完成', chat: '聊天', broadcast: '广播', system: '系统',
};

export interface FilterOptions {
  from?: AgentRole;
  to?: AgentRole | 'broadcast';
  type?: A2AMessageType;
}

export interface A2AMessageFeedProps {
  messages: A2AMessage[];
  filter?: FilterOptions;
  onFilterChange?: (filter: FilterOptions) => void;
  maxHeight?: string;
  showFilters?: boolean;
  title?: string;
}

export const A2AMessageFeed: React.FC<A2AMessageFeedProps> = ({
  messages,
  filter = {},
  onFilterChange,
  maxHeight = '400px',
  showFilters = true,
  title = 'A2A 消息流',
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [localFilter, setLocalFilter] = useState<FilterOptions>(filter);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      if (localFilter.from && msg.from !== localFilter.from) return false;
      if (localFilter.to && msg.to !== localFilter.to) return false;
      if (localFilter.type && msg.type !== localFilter.type) return false;
      return true;
    });
  }, [messages, localFilter]);

  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredMessages, autoScroll]);

  const updateFilter = (newFilter: Partial<FilterOptions>) => {
    const updated = { ...localFilter, ...newFilter };
    setLocalFilter(updated);
    onFilterChange?.(updated);
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return date.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const renderMessageCard = (message: A2AMessage, index: number) => {
    const TypeIcon = MESSAGE_TYPE_ICONS[message.type];
    const typeColorClass = MESSAGE_TYPE_COLORS[message.type];
    const fromName = getAgentDisplayName(message.from);
    const toName = message.to === 'broadcast' ? '所有人' : getAgentDisplayName(message.to as AgentRole);

    return (
      <div key={message.id} className="relative p-4 rounded-xl bg-slate-800/50 border border-white/5 hover:bg-slate-800/80 transition-all animate-in slide-in-from-bottom-2" style={{ animationDelay: `${index * 50}ms` }}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${AGENT_COLORS[message.from]} bg-opacity-80 border-2 border-white/20 text-white font-bold text-sm`}>
              {message.from.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-medium text-sm">{fromName}</span>
                <span className="text-white/40 text-xs">→</span>
                <span className="text-white/70 text-xs">{toName}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${typeColorClass}`}>
                  <TypeIcon className="w-3 h-3" /> {MESSAGE_TYPE_LABELS[message.type]}
                </span>
                <span className="flex items-center gap-1 text-white/40 text-xs">
                  <Clock className="w-3 h-3" /> {formatTime(message.timestamp)}
                </span>
              </div>
            </div>
          </div>
        </div>
        <p className="text-white/90 text-sm leading-relaxed whitespace-pre-wrap pl-13">{message.payload.content}</p>
      </div>
    );
  };

  return (
    <div className="w-full bg-slate-900 rounded-2xl border border-white/10 overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-slate-800/50">
        <div className="flex items-center gap-3">
          <Radio className="w-5 h-5 text-cyan-400" />
          <h3 className="text-white font-semibold">{title}</h3>
          <span className="px-2 py-0.5 rounded-full bg-cyan-400/20 text-cyan-400 text-xs">{filteredMessages.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAutoScroll(!autoScroll)} className={`p-2 rounded-lg transition-colors ${autoScroll ? 'bg-cyan-400/20 text-cyan-400' : 'bg-white/5 text-white/40'}`}>
            <RefreshCw className={`w-4 h-4 ${autoScroll ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
          </button>
          {showFilters && (
            <button onClick={() => setShowFilterPanel(!showFilterPanel)} className={`p-2 rounded-lg transition-colors ${showFilterPanel ? 'bg-cyan-400/20 text-cyan-400' : 'bg-white/5 text-white/40'}`}>
              <Filter className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 过滤器面板 */}
      {showFilters && showFilterPanel && (
        <div className="px-4 py-3 border-b border-white/10 bg-slate-800/30 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-white/50 text-xs w-12">发送者:</span>
            <div className="flex flex-wrap gap-1">
              <button onClick={() => updateFilter({ from: undefined })} className={`px-2 py-1 rounded text-xs ${!localFilter.from ? 'bg-cyan-400/20 text-cyan-400' : 'bg-white/5 text-white/50'}`}>全部</button>
              {AGENT_ROLES.map((role) => (
                <button key={role} onClick={() => updateFilter({ from: role })} className={`px-2 py-1 rounded text-xs ${localFilter.from === role ? 'bg-purple-500/40 text-white' : 'bg-white/5 text-white/50'}`}>
                  {getAgentDisplayName(role)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 消息列表 */}
      <div className="overflow-y-auto p-4 space-y-3" style={{ maxHeight }}>
        {filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-white/40">
            <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">暂无消息</p>
          </div>
        ) : (
          filteredMessages.map((message, index) => renderMessageCard(message, index))
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default A2AMessageFeed;
