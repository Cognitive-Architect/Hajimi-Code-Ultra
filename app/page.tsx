/**
 * 主页面 - MVP拼合
 * 布局: 左侧六权星图 + 中间聊天窗口 + 右侧状态面板
 */

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { SixStarMap, AgentChatDialog, StateIndicator, A2AMessageFeed } from './components/ui';
import type { AgentRole, A2AMessage, PowerState, ChatMessage } from '@/lib/ui/types';
import { Send, Bot, User, Menu, X } from 'lucide-react';

// 模拟消息生成
const generateMockMessages = (): A2AMessage[] => {
  const now = Date.now();
  return [
    {
      id: '1',
      from: 'pm',
      to: 'broadcast',
      type: 'proposal',
      timestamp: now - 300000,
      payload: { content: '开始新任务：实现用户认证系统' },
    },
    {
      id: '2',
      from: 'arch',
      to: 'broadcast',
      type: 'chat',
      timestamp: now - 240000,
      payload: { content: '建议使用JWT + Redis方案' },
    },
    {
      id: '3',
      from: 'engineer',
      to: 'broadcast',
      type: 'chat',
      timestamp: now - 180000,
      payload: { content: '收到，开始编码实现' },
    },
    {
      id: '4',
      from: 'qa',
      to: 'broadcast',
      type: 'review',
      timestamp: now - 60000,
      payload: { content: '代码审查通过，可以合并' },
    },
  ];
};

const AGENT_ICONS: Record<AgentRole, string> = {
  pm: '👑',
  arch: '🏗️',
  qa: '🔍',
  engineer: '💻',
  mike: '📦',
  soyorin: '📝',
};

const AGENT_NAMES: Record<AgentRole, string> = {
  pm: '客服小祥',
  arch: '压力怪',
  qa: '咕咕嘎嘎',
  engineer: '奶龙娘',
  mike: 'Mike',
  soyorin: 'Soyorin',
};

export default function Home() {
  const [activeAgent, setActiveAgent] = useState<AgentRole>('pm');
  const [currentState, setCurrentState] = useState<PowerState>('DESIGN');
  const [messages, setMessages] = useState<A2AMessage[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMessages(generateMockMessages());
  }, []);

  const handleAgentClick = useCallback((agent: AgentRole) => {
    setActiveAgent(agent);
    setIsChatOpen(true);
    setChatMessages([]);
  }, []);

  const handleSendMessage = useCallback((content: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      content,
      sender: 'user',
      timestamp: Date.now(),
    };
    setChatMessages(prev => [...prev, newMessage]);

    // 模拟Agent回复
    setTimeout(() => {
      const agentReply: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: `收到消息："${content}"\n\n我是${AGENT_NAMES[activeAgent]}，正在处理您的请求...`,
        sender: 'agent',
        timestamp: Date.now(),
      };
      setChatMessages(prev => [...prev, agentReply]);
    }, 1000);
  }, [activeAgent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      handleSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* 顶部导航 */}
      <header className="border-b border-white/10 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
              <span className="text-xl">🐍</span>
            </div>
            <div>
              <h1 className="font-bold text-lg bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Hajimi Code Ultra
              </h1>
              <p className="text-xs text-white/50">Ouroboros 七权治理系统</p>
            </div>
          </div>
          
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-lg bg-white/5"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 左侧：六权星图 */}
          <div className={`lg:col-span-3 ${isMobileMenuOpen ? 'block' : 'hidden lg:block'}`}>
            <SixStarMap 
              activeAgent={activeAgent} 
              onAgentClick={handleAgentClick}
              className="sticky top-24"
            />
          </div>

          {/* 中间：聊天窗口 */}
          <div className="lg:col-span-6 space-y-4">
            {/* 当前Agent信息 */}
            <div className="bg-slate-800/50 rounded-2xl border border-white/10 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-2xl">
                  {AGENT_ICONS[activeAgent]}
                </div>
                <div>
                  <h2 className="font-semibold">{AGENT_NAMES[activeAgent]}</h2>
                  <p className="text-xs text-white/50">点击发送消息</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-white/50">在线</span>
              </div>
            </div>

            {/* 消息列表 */}
            <div className="bg-slate-800/30 rounded-2xl border border-white/10 h-[400px] flex flex-col">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-white/30">
                    <Bot className="w-16 h-16 mb-4" />
                    <p>选择左侧Agent开始对话</p>
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div key={msg.id} className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${msg.sender === 'user' ? 'bg-slate-600' : 'bg-gradient-to-br from-purple-500 to-blue-500'}`}>
                        {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                      </div>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${msg.sender === 'user' ? 'bg-purple-600 text-white rounded-tr-sm' : 'bg-slate-700 text-white rounded-tl-sm'}`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <span className="text-xs text-white/40 mt-1 block">
                          {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* 输入框 */}
              <form onSubmit={handleSubmit} className="p-4 border-t border-white/10">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={`给 ${AGENT_NAMES[activeAgent]} 发送消息...`}
                    className="flex-1 px-4 py-3 rounded-xl bg-slate-700 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-purple-500/50"
                  />
                  <button
                    type="submit"
                    disabled={!inputValue.trim()}
                    className="px-4 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium disabled:opacity-50 hover:opacity-90 transition-all"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </form>
            </div>

            {/* A2A消息流 */}
            <A2AMessageFeed messages={messages} maxHeight="300px" />
          </div>

          {/* 右侧：状态面板 */}
          <div className="lg:col-span-3 space-y-4">
            <StateIndicator currentState={currentState} />
            
            {/* 快捷操作 */}
            <div className="bg-slate-800/50 rounded-2xl border border-white/10 p-4">
              <h3 className="text-sm font-semibold text-white mb-3">状态切换</h3>
              <div className="grid grid-cols-2 gap-2">
                {(['IDLE', 'DESIGN', 'CODE', 'AUDIT', 'BUILD', 'DEPLOY', 'DONE'] as PowerState[]).map((state) => (
                  <button
                    key={state}
                    onClick={() => setCurrentState(state)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      currentState === state 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-slate-700 text-white/60 hover:bg-slate-600'
                    }`}
                  >
                    {state === 'IDLE' && '空闲'}
                    {state === 'DESIGN' && '设计'}
                    {state === 'CODE' && '编码'}
                    {state === 'AUDIT' && '审计'}
                    {state === 'BUILD' && '构建'}
                    {state === 'DEPLOY' && '部署'}
                    {state === 'DONE' && '完成'}
                  </button>
                ))}
              </div>
            </div>

            {/* 系统信息 */}
            <div className="bg-slate-800/50 rounded-2xl border border-white/10 p-4">
              <h3 className="text-sm font-semibold text-white mb-2">系统状态</h3>
              <div className="space-y-2 text-xs text-white/60">
                <div className="flex justify-between">
                  <span>版本</span>
                  <span className="text-white">v1.0.0-RC</span>
                </div>
                <div className="flex justify-between">
                  <span>在线Agent</span>
                  <span className="text-green-400">6/6</span>
                </div>
                <div className="flex justify-between">
                  <span>消息数</span>
                  <span className="text-white">{messages.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 对话框弹窗（移动端用） */}
      <AgentChatDialog
        agent={activeAgent}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onSendMessage={handleSendMessage}
        messages={chatMessages}
        isLoading={false}
      />
    </div>
  );
}
