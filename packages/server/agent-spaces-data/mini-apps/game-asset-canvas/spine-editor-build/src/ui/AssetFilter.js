/**
 * 角色库过滤器（克隆参考仓库 Filter.jsx 的交互）。
 *
 * 数据来自 src/data/*.json（碧蓝航线角色库 mainData / factions / TypeClass / GroupType）。
 * 交互：分组(Faction) chips + 职业(Class) chips + 搜索框 + 分页。
 * 选择角色 → 触发 onSelect(base, skinName)，由 main.js 加载对应 Spine 资源。
 *
 * 注意：角色库的 .skel/.atlas/.png 资源路径为参考仓库约定（./assets/<asset>.skel 等），
 * 本 SPA 内置角色库仅作演示，资源 URL 需指向参考仓库的 GitHub Pages 或自建 CDN。
 * 实际资源加载在 main.js 的 loadFromLibrary 中处理（可配置 base URL）。
 */
import mainData from '../data/mainData.json';
import factions from '../data/factions.json';
import typeClass from '../data/TypeClass.json';
import groupType from '../data/GroupType.json';

const ITEMS_PER_PAGE = 98;

export class AssetFilter {
  constructor(container, { onSelect }) {
    this.container = container;
    this.onSelect = onSelect || (() => {});

    this.selectedFaction = null;
    this.selectedType = null;
    this.search = '';
    this.page = 0;

    this.filteredFactions = [...factions];
    this.filteredTypes = [...typeClass];

    this._render();
  }

  _getFilteredCharacters() {
    const all = Object.values(mainData);
    return all.filter((c) => {
      if (this.search) {
        return c.name.toLowerCase().includes(this.search.toLowerCase());
      }
      if (this.selectedFaction && this.selectedType) {
        return c.group === this.selectedFaction && c.type === this.selectedType;
      }
      if (this.selectedFaction) return c.group === this.selectedFaction;
      if (this.selectedType) return c.type === this.selectedType;
      return true;
    });
  }

  _render() {
    // 联动：选了 faction 则 type 限定到该分组；选了 type 则 faction 限定
    if (this.selectedFaction) {
      this.filteredTypes = groupType[this.selectedFaction] || [...typeClass];
    } else {
      this.filteredTypes = [...typeClass];
    }
    if (this.selectedType) {
      this.filteredFactions = Object.keys(groupType).filter((f) =>
        (groupType[f] || []).includes(this.selectedType));
    } else {
      this.filteredFactions = [...factions];
    }

    const characters = this._getFilteredCharacters();
    const totalPages = Math.max(1, Math.ceil(characters.length / ITEMS_PER_PAGE));
    if (this.page >= totalPages) this.page = totalPages - 1;
    if (this.page < 0) this.page = 0;
    const pageChars = characters.slice(
      this.page * ITEMS_PER_PAGE, (this.page + 1) * ITEMS_PER_PAGE);

    this.container.innerHTML = `
      <div class="filter-section">
        <h3>阵营 Faction</h3>
        <div class="filter-chips" id="faction-chips"></div>
      </div>
      <div class="filter-section">
        <h3>职业 Class</h3>
        <div class="filter-chips" id="type-chips"></div>
      </div>
      <input class="search-box" id="char-search" type="text" placeholder="搜索角色名…" value="${escapeHtml(this.search)}" />
      <div class="char-grid" id="char-grid"></div>
      <div class="pagination" id="pagination"></div>
    `;

    // Faction chips
    const fc = this.container.querySelector('#faction-chips');
    const showFactions = this.selectedFaction ? [this.selectedFaction] : this.filteredFactions;
    for (const f of showFactions) {
      const chip = el('button', `filter-chip ${this.selectedFaction === f ? 'active' : ''}`, f);
      chip.onclick = () => {
        this.selectedFaction = this.selectedFaction === f ? null : f;
        this.page = 0;
        this._render();
      };
      fc.appendChild(chip);
    }

    // Type chips
    const tc = this.container.querySelector('#type-chips');
    const showTypes = this.selectedType ? [this.selectedType] : this.filteredTypes;
    for (const t of showTypes) {
      const chip = el('button', `filter-chip ${this.selectedType === t ? 'active' : ''}`, t);
      chip.onclick = () => {
        this.selectedType = this.selectedType === t ? null : t;
        this.page = 0;
        this._render();
      };
      tc.appendChild(chip);
    }

    // 搜索框
    const search = this.container.querySelector('#char-search');
    search.oninput = (e) => {
      this.search = e.target.value;
      this.page = 0;
      // 只重绘角色网格和分页，不重建整个面板（保留焦点）
      this._renderList();
    };

    // 角色卡片
    const grid = this.container.querySelector('#char-grid');
    for (const c of pageChars) {
      const card = el('div', 'char-card', c.name);
      card.title = `${c.name} · ${c.group} · ${c.type}`;
      card.onclick = () => {
        // 高亮选中
        this.container.querySelectorAll('.char-card').forEach((x) => x.classList.remove('active'));
        card.classList.add('active');
        this.onSelect(c);
      };
      grid.appendChild(card);
    }

    // 分页
    this._renderPagination(totalPages);
  }

  /** 仅刷新角色列表和分页（搜索时避免重建输入框） */
  _renderList() {
    const characters = this._getFilteredCharacters();
    const totalPages = Math.max(1, Math.ceil(characters.length / ITEMS_PER_PAGE));
    if (this.page >= totalPages) this.page = totalPages - 1;
    const pageChars = characters.slice(
      this.page * ITEMS_PER_PAGE, (this.page + 1) * ITEMS_PER_PAGE);
    const grid = this.container.querySelector('#char-grid');
    if (!grid) { this._render(); return; }
    grid.innerHTML = '';
    for (const c of pageChars) {
      const card = el('div', 'char-card', c.name);
      card.title = `${c.name} · ${c.group} · ${c.type}`;
      card.onclick = () => {
        this.container.querySelectorAll('.char-card').forEach((x) => x.classList.remove('active'));
        card.classList.add('active');
        this.onSelect(c);
      };
      grid.appendChild(card);
    }
    this._renderPagination(totalPages);
  }

  _renderPagination(totalPages) {
    const pg = this.container.querySelector('#pagination');
    if (!pg) return;
    pg.innerHTML = '';
    if (totalPages <= 1) return;
    // 上一页
    pg.appendChild(pageBtn('‹', () => { this.page = Math.max(0, this.page - 1); this._render(); }, this.page === 0));
    // 页码（显示窗口）
    const win = 3;
    const start = Math.max(0, this.page - win);
    const end = Math.min(totalPages - 1, this.page + win);
    for (let i = start; i <= end; i++) {
      pg.appendChild(pageBtn(String(i + 1), () => { this.page = i; this._render(); }, false, i === this.page));
    }
    if (end < totalPages - 1) pg.appendChild(el('span', '', '…'));
    // 下一页
    pg.appendChild(pageBtn('›', () => { this.page = Math.min(totalPages - 1, this.page + 1); this._render(); }, this.page >= totalPages - 1));
  }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function pageBtn(text, onclick, disabled, active) {
  const b = el('button', `page-btn ${active ? 'active' : ''}`, text);
  b.onclick = onclick;
  b.disabled = !!disabled;
  return b;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default AssetFilter;
