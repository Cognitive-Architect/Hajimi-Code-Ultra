/**
 * DebugDoctorPanel - 奶龙娘诊断室组件
 * 角色: Debug Doctor (Level 1 实习医师)
 * 主题色: 奶黄 #FFDD00
 * 台词: "哇是奖金！"
 * 
 * 自测点:
 * - DOC-001: 奶黄主题色应用
 * - DOC-002: 诊断报告模板含症状/病理/治疗方案/预后区块
 * - DOC-003: 修复成功按钮显示"哇是奖金！"
 */

'use client';

import React from 'react';
import { Stethoscope, Activity, Microscope, Pill, Sparkles } from 'lucide-react';

/**
 * 诊断区块组件
 */
interface DiagnosisSectionProps {
  title: string;
  content: string;
  icon?: React.ReactNode;
}

const DiagnosisSection: React.FC<DiagnosisSectionProps> = ({ 
  title, 
  content, 
  icon 
}) => {
  return (
    <div className="bg-slate-900/50 rounded-xl p-3 border border-[#FFDD00]/20">
      <div className="flex items-center gap-2 mb-2">
        {icon && <span className="text-[#FFDD00]/70">{icon}</span>}
        <h4 className="text-[#FFDD00] font-semibold text-sm">{title}</h4>
      </div>
      <p className="text-white/60 text-xs leading-relaxed pl-0.5">
        {content || '等待诊断中...'}
      </p>
    </div>
  );
};

/**
 * DebugDoctorPanel - 奶龙娘诊断面板
 * Level 1 实习医师 - 仅UI占位
 */
export interface DebugDoctorPanelProps {
  /** 是否显示修复按钮 */
  showFixButton?: boolean;
  /** 修复按钮点击回调 */
  onFix?: () => void;
  /** 自定义类名 */
  className?: string;
}

export const DebugDoctorPanel: React.FC<DebugDoctorPanelProps> = ({
  showFixButton = true,
  onFix,
  className = '',
}) => {
  return (
    <div 
      className={`
        bg-[#FFDD00]/10 
        border border-[#FFDD00]/30 
        rounded-2xl 
        p-6 
        backdrop-blur-sm
        ${className}
      `}
    >
      {/* 奶龙娘主题头 */}
      <div className="flex items-center gap-3 mb-5">
        <div className="
          w-10 h-10 
          rounded-full 
          bg-[#FFDD00] 
          flex items-center justify-center
          shadow-lg shadow-[#FFDD00]/20
          animate-pulse
        ">
          <Stethoscope className="w-5 h-5 text-black" />
        </div>
        <div>
          <h3 className="text-[#FFDD00] font-bold text-lg">奶龙娘诊断室</h3>
          <p className="text-xs text-white/50">Level 1 实习医师 · 贫困偶像</p>
        </div>
        <div className="ml-auto">
          <Sparkles className="w-5 h-5 text-[#FFDD00]/60" />
        </div>
      </div>

      {/* 诊断报告模板 */}
      <div className="space-y-3">
        <DiagnosisSection 
          title="症状" 
          content="等待患者入诊..."
          icon={<Activity className="w-4 h-4" />}
        />
        <DiagnosisSection 
          title="病理" 
          content="正在进行病理分析..."
          icon={<Microscope className="w-4 h-4" />}
        />
        <DiagnosisSection 
          title="治疗方案" 
          content="制定治疗方案中..."
          icon={<Pill className="w-4 h-4" />}
        />
        <DiagnosisSection 
          title="预后" 
          content="评估康复预后..."
          icon={<Sparkles className="w-4 h-4" />}
        />
      </div>

      {/* 修复成功按钮 */}
      {showFixButton && (
        <button 
          onClick={onFix}
          className="
            mt-5 
            w-full 
            py-3 
            bg-[#FFDD00] 
            text-black 
            rounded-lg 
            font-bold 
            text-sm
            transition-all 
            duration-200
            hover:bg-[#FFEE44] 
            hover:shadow-lg 
            hover:shadow-[#FFDD00]/30
            hover:scale-[1.02]
            active:scale-[0.98]
            flex 
            items-center 
            justify-center 
            gap-2
          "
        >
          <span>修复成功！哇是奖金！</span>
          <span className="text-lg">💰</span>
        </button>
      )}

      {/* Level 1 实习医师水印 */}
      <div className="mt-4 text-center">
        <span className="text-[10px] text-[#FFDD00]/30">
          🐉 奶龙娘 · Debug Doctor Level 1 · 实习中
        </span>
      </div>
    </div>
  );
};

/**
 * 诊断数据接口 (预留)
 */
export interface DiagnosisData {
  symptom: string;
  pathology: string;
  treatment: string;
  prognosis: string;
}

/**
 * 带数据的诊断面板 (预留)
 */
export interface DebugDoctorPanelWithDataProps extends DebugDoctorPanelProps {
  data: DiagnosisData;
}

export default DebugDoctorPanel;
