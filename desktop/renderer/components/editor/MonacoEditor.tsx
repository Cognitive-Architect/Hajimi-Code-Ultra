'use client';

import React, { useRef, useCallback } from 'react';
import Editor, { OnMount, OnChange } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

interface MonacoEditorProps {
  value?: string;
  language?: string;
  path?: string;
  onChange?: (value: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({
  value = '',
  language = 'typescript',
  path,
  onChange,
  onSave,
  readOnly = false,
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<any>(null);

  // P1-01: Monaco 加载
  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // P1-10: JetBrains Mono 字体
    editor.updateOptions({
      fontFamily: 'JetBrains Mono, Consolas, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 22,
      fontLigatures: true, // P1-03: 字体连字
    });

    // P1-05: 多光标编辑 - Alt+Click 添加光标 (Monaco 默认支持)

    // Ctrl+S 保存
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave?.();
    });

    // P1-06: 查找替换快捷键
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
      editor.getAction('actions.find')?.run();
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH, () => {
      editor.getAction('editor.action.startFindReplaceAction:')?.run();
    });
  }, [onSave]);

  // P1-04: 小地图
  const editorOptions: editor.IStandaloneEditorConstructionOptions = {
    minimap: { enabled: true }, // P1-04: Minimap
    folding: true, // P1-03: 代码折叠
    readOnly,
    automaticLayout: true,
    scrollBeyondLastLine: false,
    smoothScrolling: true, // P1-04: 平滑滚动
    cursorSmoothCaretAnimation: 'on', // P1-05: 光标动画
    bracketPairColorization: { enabled: true },
    guides: {
      bracketPairs: true,
      indentation: true,
    },
  };

  const handleChange: OnChange = useCallback((newValue) => {
    if (newValue !== undefined) {
      onChange?.(newValue);
    }
  }, [onChange]);

  return (
    <div className="w-full h-full bg-slate-900">
      <Editor
        height="100%"
        defaultLanguage={language}
        language={language}
        value={value}
        path={path}
        onMount={handleEditorMount}
        onChange={handleChange}
        options={editorOptions}
        theme="vs-dark" // P1-06: 深色模式
        loading={
          <div className="flex items-center justify-center h-full text-white">
            Loading Editor...
          </div>
        }
      />
    </div>
  );
};

export default MonacoEditor;
