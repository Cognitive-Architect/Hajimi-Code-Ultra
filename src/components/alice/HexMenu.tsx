/**
 * 七权快捷菜单 (六角星形)
 * HAJIMI-ALICE-UI
 * 
 * ID-61七权角色：🟣祥 🟢睦 🩷音 🩵鸭 💛素 🔵压 🟡娘
 * 
 * @module src/components/alice/HexMenu
 * @author 客服小祥 (Orchestrator) - B-06/09
 */

import React, { useCallback } from 'react';
import { createPortal } from 'react-dom';
import './HexMenu.css';

export interface HexMenuProps {
  anchorX: number;
  anchorY: number;
  onSelect: (persona: string) => void;
  onClose: () => void;
}

// 七权角色定义 (ID-61)
const PERSONAS = [
  { id: 'xiaoxiang', name: '祥', color: '#8B5CF6', role: 'Orchestrator', icon: '◆' },   // 🟣
  { id: 'cucumber', name: '睦', color: '#22C55E', role: 'Architect', icon: '◎' },     // 🟢
  { id: 'tangyin', name: '音', color: '#EC4899', role: 'Engineer', icon: '♪' },       // 🩷
  { id: 'duck', name: '鸭', color: '#06B6D4', role: 'QA', icon: '✓' },                // 🩵
  { id: 'soyorin', name: '素', color: '#EAB308', role: 'PM', icon: '★' },             // 💛
  { id: 'pressure', name: '压', color: '#3B82F6', role: 'Audit', icon: '!' },         // 🔵
  { id: 'niang', name: '娘', color: '#F59E0B', role: 'Doctor', icon: '+' },           // 🟡
];

export const HexMenu: React.FC<HexMenuProps> = ({ anchorX, anchorY, onSelect, onClose }) => {
  const handleSelect = useCallback((persona: typeof PERSONAS[0]) => {
    onSelect(persona.id);
  }, [onSelect]);

  // 计算六角位置
  const hexRadius = 80;
  const getHexPosition = (index: number) => {
    const angle = (index * 60 - 90) * (Math.PI / 180); // -90度从顶部开始
    return {
      x: Math.cos(angle) * hexRadius,
      y: Math.sin(angle) * hexRadius,
    };
  };

  return createPortal(
    <div className="hex-menu-overlay" onClick={onClose}>
      <div 
        className="hex-menu-container"
        style={{
          left: anchorX,
          top: anchorY,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 中心 orb */}
        <div className="hex-center">
          <span>Alice</span>
        </div>
        
        {/* 七权节点 */}
        {PERSONAS.map((persona, index) => {
          const pos = getHexPosition(index);
          return (
            <button
              key={persona.id}
              className="hex-node"
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                backgroundColor: persona.color,
                animationDelay: `${index * 50}ms`,
              }}
              onClick={() => handleSelect(persona)}
              title={`${persona.name} - ${persona.role}`}
            >
              <span className="hex-icon">{persona.icon}</span>
              <span className="hex-name">{persona.name}</span>
            </button>
          );
        })}
        
        {/* 连接线 SVG */}
        <svg className="hex-lines" viewBox="-100 -100 200 200">
          {PERSONAS.map((_, index) => {
            const pos1 = getHexPosition(index);
            const pos2 = getHexPosition((index + 1) % 7);
            return (
              <line
                key={index}
                x1={pos1.x}
                y1={pos1.y}
                x2={pos2.x}
                y2={pos2.y}
                stroke="rgba(74, 144, 226, 0.3)"
                strokeWidth="2"
              />
            );
          })}
        </svg>
      </div>
    </div>,
    document.body
  );
};

export default HexMenu;
