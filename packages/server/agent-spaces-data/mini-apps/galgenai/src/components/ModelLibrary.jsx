// 移植自原 ModelLibrary.tsx：从 Eikanya 仓库拉取模型清单，点击切换当前模型。
import React, { useEffect, useMemo, useState } from 'react';
import { parseRepoData } from '../utils/repo';

export default function ModelLibrary({ store }) {
  const { settings, updateSettings, setView } = store;

  const [activeTab, setActiveTab] = useState('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [repoError, setRepoError] = useState('');

  const browseItems = settings.libraryCache || [];

  const fetchRepo = async () => {
    if (!settings.repositories || settings.repositories.length === 0) return;
    setIsLoading(true);
    setRepoError('');
    try {
      const repo = settings.repositories[0];
      const res = await fetch(repo.url);
      if (!res.ok) throw new Error('仓库请求失败');
      const data = await res.json();
      const items = parseRepoData(data);
      updateSettings({ libraryCache: items, libraryLastUpdated: Date.now() });
    } catch (e) {
      console.error(e);
      setRepoError('模型仓库加载失败。');
    } finally {
      setIsLoading(false);
    }
  };

  // 首次进入 browse 且无缓存时自动拉取
  useEffect(() => {
    if (activeTab === 'browse' && browseItems.length === 0 && !isLoading) {
      fetchRepo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, browseItems.length]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (activeTab === 'browse') {
      return browseItems.filter(
        (it) => it.name.toLowerCase().includes(q) || it.category.toLowerCase().includes(q),
      );
    }
    if (activeTab === 'favorites') {
      return (settings.favoriteModels || []).filter((it) => it.name.toLowerCase().includes(q));
    }
    if (activeTab === 'history') {
      return (settings.recentModels || []).filter((it) => it.name.toLowerCase().includes(q));
    }
    return [];
  }, [browseItems, settings.favoriteModels, settings.recentModels, activeTab, searchQuery]);

  const handleSelectModel = (item) => {
    const newModel = {
      id: `m-${Date.now()}`,
      name: item.name,
      url: item.url,
      scale: 1.0,
      xOffset: 0,
      yOffset: 0,
    };
    updateSettings({
      models: [...(settings.models || []), newModel],
      currentModelId: newModel.id,
      recentModels: [
        { id: newModel.id, name: newModel.name, url: newModel.url, timestamp: Date.now() },
        ...(settings.recentModels || []).filter((m) => m.url !== newModel.url),
      ].slice(0, 20),
    });
    setView('chat');
  };

  const handleToggleFavorite = (e, item) => {
    e.stopPropagation();
    const favs = settings.favoriteModels || [];
    const exists = favs.some((m) => m.url === item.url);
    updateSettings({
      favoriteModels: exists
        ? favs.filter((m) => m.url !== item.url)
        : [{ id: `fav-${item.name}`, name: item.name, url: item.url, timestamp: Date.now() }, ...favs],
    });
  };

  const isFavorite = (url) => (settings.favoriteModels || []).some((m) => m.url === url);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="glass-panel w-full max-w-5xl h-[90vh] flex flex-col rounded-2xl overflow-hidden text-white">
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/20">
          <h2 className="text-2xl font-bold text-cyan-400">📚 模型库</h2>
          <div className="flex gap-4 items-center">
            <button onClick={fetchRepo} className="text-cyan-400 hover:text-cyan-300" title="刷新">
              <span className={isLoading ? 'inline-block animate-spin' : 'inline-block'}>🔄</span>
            </button>
            <button onClick={() => setView('chat')} className="text-gray-400 hover:text-white text-2xl">
              ✕
            </button>
          </div>
        </div>

        <div className="p-4 flex flex-col md:flex-row gap-4 border-b border-white/10 bg-white/5">
          <div className="flex bg-black/30 rounded-lg p-1">
            {['browse', 'favorites', 'history'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-md text-sm font-bold transition ${
                  activeTab === tab
                    ? tab === 'browse'
                      ? 'bg-cyan-600 text-white'
                      : tab === 'favorites'
                        ? 'bg-pink-600 text-white'
                        : 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tab === 'browse' ? '浏览' : tab === 'favorites' ? '收藏' : '历史'}
              </button>
            ))}
          </div>
          <div className="flex-grow relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              placeholder="搜索模型…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-white outline-none focus:border-cyan-400 transition"
            />
          </div>
        </div>

        <div className="flex-grow overflow-y-auto p-4 custom-scrollbar bg-black/10">
          {isLoading && browseItems.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-cyan-400 gap-4">
              <div className="w-10 h-10 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <p>加载模型仓库…</p>
            </div>
          )}

          {!isLoading && repoError && (
            <div className="flex flex-col items-center justify-center h-full text-red-400 gap-2">
              <p>{repoError}</p>
            </div>
          )}

          {!isLoading && !repoError && filteredItems.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <p>暂无模型。</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredItems.map((item, idx) => (
              <div
                key={`${item.url}-${idx}`}
                onClick={() => handleSelectModel(item)}
                className="group relative bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 hover:border-cyan-500/50 transition cursor-pointer flex flex-col"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-mono text-cyan-400 bg-cyan-900/30 px-2 py-0.5 rounded">
                    {item.category || 'Model'}
                  </span>
                  <button
                    onClick={(e) => handleToggleFavorite(e, item)}
                    className={`text-lg transition ${
                      isFavorite(item.url) ? 'text-pink-500' : 'text-gray-600 group-hover:text-pink-400'
                    }`}
                  >
                    ❤️
                  </button>
                </div>
                <div className="flex-grow flex items-center justify-center py-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-2xl font-bold text-gray-500 group-hover:text-cyan-400 transition">
                    {item.name.charAt(0).toUpperCase()}
                  </div>
                </div>
                <div className="mt-2 text-center">
                  <h3 className="font-bold text-gray-200 group-hover:text-white truncate" title={item.name}>
                    {item.name}
                  </h3>
                  <p className="text-xs text-gray-500 truncate" title={item.url}>
                    {item.url.split('/').pop()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 bg-black/40 text-xs text-gray-500 flex justify-between">
          <span>Repo: Eikanya/Live2d-model</span>
          <span>{filteredItems.length} 项</span>
        </div>
      </div>
    </div>
  );
}
