/**
 * 主页面 - 人格化整合v2
 * 布局: 悬浮球 + 左侧六权星图 + 中间聊天窗口 + 右侧审计面板
 * 
 * 自测点:
 * - INT-001: 同时渲染SixStarMap+AgentChatDialog+AuditPanel无样式冲突 ✅
 * - INT-002: 主题切换（客服小祥↔压力怪）颜色变量正确热更新 ✅
 * - INT-003: 无控制台警告（Strict Mode合规） ✅
 */

'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { SixStarMap, AgentChatDialog } from './components/ui';
import { FloatingOrb } from './components/ui/FloatingOrb';
import { TakiAuditPanel } from './components/ui/TakiAuditPanel';
import type { AgentRole, A2AMessage, ChatMessage } from '@/lib/ui/types';
import { getAgentDisplayName, AGENT_DISPLAY_CONFIG } from '@/lib/ui/types';
import { Send, Bot, User, Menu, X } from 'lucide-react';

// ==================== 模拟数据生成 ====================

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

// ==================== 主题配置 ====================

const THEME_CONFIG: Record<AgentRole, {
  gradient: string;
  shadow: string;
  primary: string;
  light: string;
  dark: string;
}> = {
  pm: {
    gradient: 'from-purple-600 to-purple-400',
    shadow: 'shadow-purple-500/30',
    primary: '#884499',
    light: '#AA66BB',
    dark: '#662277',
  },
  arch: {
    gradient: 'from-blue-600 to-blue-400',
    shadow: 'shadow-blue-500/30',
    primary: '#7777AA',
    light: '#9999CC',
    dark: '#555588',
  },
  qa: {
    gradient: 'from-green-600 to-green-400',
    shadow: 'shadow-green-500/30',
    primary: '#66BB66',
    light: '#88DD88',
    dark: '#449944',
  },
  engineer: {
    gradient: 'from-yellow-600 to-yellow-400',
    shadow: 'shadow-yellow-500/30',
    primary: '#FFDD88',
    light: '#FFEEAA',
    dark: '#EEBB66',
  },
  mike: {
    gradient: 'from-red-600 to-red-400',
    shadow: 'shadow-red-500/30',
    primary: '#EE6677',
    light: '#FF88AA',
    dark: '#CC4455',
  },
  soyorin: {
    gradient: 'from-pink-600 to-pink-400',
    shadow: 'shadow-pink-500/30',
    primary: '#FF88BB',
    light: '#FFAACC',
    dark: '#EE6699',
  },
};

// AgentRole 与 FloatingOrb AgentTheme 的映射
const AGENT_TO_THEME: Record<AgentRole, string> = {
  pm: 'pm',
  arch: 'arch',
  qa: 'qa',
  engineer: 'engineer',
  mike: 'mike',
  soyorin: 'soyorin',
};

const THEME_TO_AGENT: Record<string, AgentRole> = {
  pm: 'pm',
  arch: 'arch',
  qa: 'qa',
  engineer: 'engineer',
  mike: 'mike',
  soyorin: 'soyorin',
  mutsumi: 'pm', // mutsumi 映射到 pm
};

// ==================== 主页面组件 ====================

export default function HomePage() {
  // 主题状态 - 使用 AgentRole 作为内部状态
  const [activeTheme, setActiveTheme] = useState<AgentRole>('pm');
  const theme = useMemo(() => THEME_CONFIG[activeTheme], [activeTheme]);
  
  // Agent状态
  const [activeAgent, setActiveAgent] = useState<AgentRole>('pm');
  
  // 消息状态
  const [a2aMessages, setA2aMessages] = useState<A2AMessage[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  
  // UI状态
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isChatDialogOpen, setIsChatDialogOpen] = useState(false);

  // 初始化消息
  useEffect(() => {
    setA2aMessages(generateMockMessages());
  }, []);

  // Agent点击处理
  const handleAgentClick = useCallback((agent: AgentRole) => {
    setActiveAgent(agent);
    setActiveTheme(agent); // 同步更新主题
    setChatMessages([]);
    setIsChatDialogOpen(true);
  }, []);

  // 主题切换处理 - 适配 FloatingOrb 的 AgentTheme
  const handleThemeChange = useCallback((newTheme: string) => {
    const agent = THEME_TO_AGENT[newTheme] || 'pm';
    setActiveTheme(agent);
    setActiveAgent(agent);
    setChatMessages([]);
  }, []);

  // 发送消息处理
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
        content: `收到消息："${content}"\n\n我是${getAgentDisplayName(activeAgent)}，正在处理您的请求...`,
        sender: 'agent',
        timestamp: Date.now(),
      };
      setChatMessages(prev => [...prev, agentReply]);
    }, 1000);
  }, [activeAgent]);

  // 表单提交处理
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      handleSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  // 当前Agent配置
  const agentConfig = AGENT_DISPLAY_CONFIG[activeAgent];

  return (
    // 根容器：应用data-theme属性用于CSS变量作用域
    <div 
      data-theme={activeTheme} 
      data-persona-version="2.0"
      className="min-h-screen bg-slate-900 text-white"
    >
      {/* ==================== 悬浮球主题切换器 ==================== */}
      <FloatingOrb 
        initialTheme={AGENT_TO_THEME[activeTheme] as any} 
        onThemeChange={handleThemeChange} 
      />

      {/* ==================== 顶部导航 ==================== */}
      <header className="border-b border-white/10 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* 主题渐变Logo */}
            <div className={`
              w-10 h-10 rounded-xl flex items-center justify-center
              bg-gradient-to-br ${theme.gradient}
              shadow-lg ${theme.shadow}
              transition-all duration-500
            `}>
              <span className="text-xl">🐍</span>
            </div>
            <div>
              <h1 className={`
                font-bold text-lg bg-gradient-to-r ${theme.gradient} bg-clip-text text-transparent
                transition-all duration-500
              `}>
                Hajimi Code Ultra
              </h1>
              <p className="text-xs text-white/50">Ouroboros 七权治理系统</p>
            </div>
          </div>
          
          {/* 移动端菜单按钮 */}
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            aria-label={isMobileMenuOpen ? '关闭菜单' : '打开菜单'}
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* ==================== 主内容区：三栏布局 ==================== */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* ==================== 左侧：六权星图 ==================== */}
          <div className={`lg:col-span-3 ${isMobileMenuOpen ? 'block' : 'hidden lg:block'}`}>
            <SixStarMap 
              activeAgent={activeAgent} 
              onAgentClick={handleAgentClick}
              className="sticky top-24"
            />
          </div>

          {/* ==================== 中间：聊天窗口 ==================== */}
          <div className="lg:col-span-6 space-y-4">
            {/* 当前Agent信息卡片 - 主题色动态变化 */}
            <div className={`
              bg-slate-800/50 rounded-2xl border p-4 flex items-center justify-between
              transition-all duration-500
              ${activeTheme === 'pm' ? 'border-purple-500/20 shadow-purple-500/10' : ''}
              ${activeTheme === 'arch' ? 'border-blue-500/20 shadow-blue-500/10' : ''}
              ${activeTheme === 'qa' ? 'border-green-500/20 shadow-green-500/10' : ''}
              ${activeTheme === 'engineer' ? 'border-yellow-500/20 shadow-yellow-500/10' : ''}
              ${activeTheme === 'mike' ? 'border-red-500/20 shadow-red-500/10' : ''}
              ${activeTheme === 'soyorin' ? 'border-pink-500/20 shadow-pink-500/10' : ''}
            `}>
              <div className="flex items-center gap-3">
                <div className={`
                  w-12 h-12 rounded-full flex items-center justify-center text-2xl
                  bg-gradient-to-br ${theme.gradient}
                  shadow-lg ${theme.shadow}
                  transition-all duration-500
                `}>
                  {agentConfig.icon}
                </div>
                <div>
                  <h2 className="font-semibold">{agentConfig.name}</h2>
                  <p className="text-xs text-white/50">{agentConfig.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`
                  w-2 h-2 rounded-full animate-pulse
                  transition-colors duration-500
                `} style={{ backgroundColor: theme.primary }} />
                <span className="text-xs text-white/50">在线</span>
              </div>
            </div>

            {/* 消息列表 */}
            <div className="bg-slate-800/30 rounded-2xl border border-white/10 h-[400px] flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-white/30">
                    <Bot className="w-16 h-16 mb-4" />
                    <p>选择左侧Agent或点击下方开始对话</p>
                    <p className="text-xs mt-2 opacity-60">当前主题: {agentConfig.name}</p>
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div 
                      key={msg.id} 
                      className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}
                    >
                      <div className={`
                        w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                        ${msg.sender === 'user' 
                          ? 'bg-slate-600' 
                          : `bg-gradient-to-br ${theme.gradient}`}
                        transition-all duration-500
                      `}>
                        {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                      </div>
                      <div className={`
                        max-w-[80%] rounded-2xl px-4 py-2
                        ${msg.sender === 'user' 
                          ? 'bg-slate-700 text-white rounded-tr-sm' 
                          : 'bg-slate-700/80 text-white rounded-tl-sm border border-white/10'}
                      `}>
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
              <form onSubmit={handleSubmit} className="p-4 border-t border-white/10 bg-slate-900/50">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={`给 ${agentConfig.name} 发送消息...`}
                    className={`
                      flex-1 px-4 py-3 rounded-xl 
                      bg-slate-700 border text-white placeholder-white/40 
                      focus:outline-none focus:ring-2 transition-all duration-300
                      ${activeTheme === 'pm' ? 'focus:border-purple-500/50 focus:ring-purple-500/20' : ''}
                      ${activeTheme === 'arch' ? 'focus:border-blue-500/50 focus:ring-blue-500/20' : ''}
                      ${activeTheme === 'qa' ? 'focus:border-green-500/50 focus:ring-green-500/20' : ''}
                      ${activeTheme === 'engineer' ? 'focus:border-yellow-500/50 focus:ring-yellow-500/20' : ''}
                      ${activeTheme === 'mike' ? 'focus:border-red-500/50 focus:ring-red-500/20' : ''}
                      ${activeTheme === 'soyorin' ? 'focus:border-pink-500/50 focus:ring-pink-500/20' : ''}
                    `}
                  />
                  <button
                    type="submit"
                    disabled={!inputValue.trim()}
                    className={`
                      px-4 py-3 rounded-xl text-white font-medium
                      bg-gradient-to-r ${theme.gradient}
                      disabled:opacity-50 hover:opacity-90 
                      shadow-lg ${theme.shadow}
                      transition-all duration-500
                    `}
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ==================== 右侧：审计面板 ==================== */}
          <div className="lg:col-span-3 space-y-4">
            {/* 使用TakiAuditPanel（压力怪审计面板） */}
            <TakiAuditPanel 
              result={{
                grade: 'A',
                score: 85,
                issues: [],
                debtCount: 0,
                timestamp: new Date()
              }}
            />
            
            {/* 系统信息 */}
            <div className="bg-slate-800/50 rounded-2xl border border-white/10 p-4">
              <h3 className="text-sm font-semibold text-white mb-3">系统状态</h3>
              <div className="space-y-2 text-xs text-white/60">
                <div className="flex justify-between">
                  <span>版本</span>
                  <span className="text-white">v2.0.0-Persona</span>
                </div>
                <div className="flex justify-between">
                  <span>当前主题</span>
                  <span 
                    className="font-medium transition-colors duration-500"
                    style={{ color: theme.primary }}
                  >
                    {agentConfig.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>在线Agent</span>
                  <span className="text-green-400">6/6</span>
                </div>
                <div className="flex justify-between">
                  <span>A2A消息</span>
                  <span className="text-white">{a2aMessages.length}</span>
                </div>
              </div>
            </div>

            {/* 主题指示器 */}
            <div className="bg-slate-800/50 rounded-2xl border border-white/10 p-4">
              <h3 className="text-sm font-semibold text-white mb-3">当前主题</h3>
              <div className="flex items-center gap-3">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
                  style={{ 
                    background: `linear-gradient(135deg, ${theme.light}, ${theme.dark})`,
                    boxShadow: `0 4px 15px ${theme.primary}40`
                  }}
                >
                  {agentConfig.icon}
                </div>
                <div>
                  <div className="font-medium text-white">{agentConfig.name}</div>
                  <div className="text-xs text-white/50">{agentConfig.powers[0]}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ==================== 全屏对话框（移动端用） ==================== */}
      <AgentChatDialog
        agent={activeAgent}
        isOpen={isChatDialogOpen}
        onClose={() => setIsChatDialogOpen(false)}
        onSendMessage={handleSendMessage}
        messages={chatMessages}
        isLoading={false}
      />
    </div>
  );
}
