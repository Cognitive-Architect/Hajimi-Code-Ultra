'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [projects, setProjects] = useState<any[]>([]);
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    // 检查是否在Electron环境中
    const win = window as any;
    if (typeof window !== 'undefined' && win.electronAPI) {
      setIsElectron(true);
      loadRecentProjects();
    }
  }, []);

  const loadRecentProjects = async () => {
    try {
      const win = window as any;
      const recentProjects = await win.electronAPI.project.list();
      setProjects(recentProjects);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const handleOpenProject = async () => {
    try {
      const win = window as any;
      const project = await win.electronAPI.project.open();
      if (project) {
        console.log('Opened project:', project);
        loadRecentProjects();
      }
    } catch (error) {
      console.error('Failed to open project:', error);
    }
  };

  if (!isElectron) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Hajimi Code Ultra</h1>
          <p className="text-gray-400">This app must be run inside Electron</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
          Hajimi Code Ultra
        </h1>
        <p className="text-gray-400 mt-2">Desktop IDE with Seven-Power Governance</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 打开项目 */}
        <button
          onClick={handleOpenProject}
          className="p-6 bg-slate-800 rounded-xl border border-slate-700 hover:border-purple-500 transition-colors text-left"
        >
          <h2 className="text-xl font-semibold mb-2">Open Project</h2>
          <p className="text-gray-400">Open an existing project folder</p>
        </button>

        {/* 最近项目 */}
        <div className="p-6 bg-slate-800 rounded-xl border border-slate-700">
          <h2 className="text-xl font-semibold mb-4">Recent Projects</h2>
          {projects.length === 0 ? (
            <p className="text-gray-500">No recent projects</p>
          ) : (
            <ul className="space-y-2">
              {projects.map((project) => (
                <li
                  key={project.id}
                  className="p-3 bg-slate-700 rounded-lg hover:bg-slate-600 cursor-pointer transition-colors"
                >
                  <div className="font-medium">{project.name}</div>
                  <div className="text-sm text-gray-400">{project.path}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 状态栏 */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 bg-slate-800 border-t border-slate-700">
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>Electron Desktop App</span>
          <span>v1.0.0</span>
        </div>
      </footer>
    </div>
  );
}
