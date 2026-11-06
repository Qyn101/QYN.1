// Client half of @local/dsh-skill-picker.
// Adds a "技能 / Skills" button to the composer tool row
// (`conversation.input.left`) and renders a floating picker through
// `conversation.input.overlay`. Clicking a row inserts the skill token
// (`/name `) into the current draft, which the composer turns into a skill chip.

window.__ModuleLoader__.load({
  id: '@local/dsh-skill-picker',
  factory(require) {
    const React = require('react');
    const { createPortal } = require('react-dom');
    const h = React.createElement;

    const CHANNEL = '/dsh-skill-picker';
    // The intro must stay within 20 characters, including the trailing ellipsis.
    const INTRO_MAX = 19;
    const HOVER_ATTR = 'data-open';
    const LANG_KEY = 'dsh-skill-picker.lang';

    // Skill names stay exactly as the Host publishes them; only the one-line
    // intro is translated. Keys are skill names, values are <= 20 characters.
    // A skill without an entry here falls back to the Host description.
    const ZH_INTROS = {
      'agent-experience': '写工具与技能说明时优化可发现性',
      archify: '生成架构图/流程图/时序图页面',
      'chinese-ppt-deck': '中文 PPT 制作与修改',
      'cordis-composition-reference': 'Cordis 组合与补丁 YAML 语法',
      'cordis-plugin-development': '开发安装调试 DSH 插件与界面',
      'diagnose-windows-sandbox-acl': '诊断修复 Windows 沙箱权限拒绝',
      'drawai-canvas': '读写 DrawAI 画布与图形',
      'editing-cordis-compositions': '编写并校验 agent 预设组合',
      'learning-content-vetting': '判断学习资料是否值得看',
      office: 'Office 文档表格演示与 PDF',
      'office-docx': '创建读取编辑 Word 文档',
      'office-export-pdf': '把 Office 文档导出为 PDF',
      'office-pptx': '创建读取编辑 PPT 演示',
      'office-recalculate': '重算表格公式并校验数值',
      'office-render': '渲染文档为图片查排版',
      'office-xlsx': '创建读取编辑 Excel 表格',
      'physics-lab-report-docx': '大学物理实验报告排版',
      'ppt-master': '生成可编辑 PPTX 演示文稿',
      modlens: '给纯文本模型读图的能力',
      'ego-browser': '操作浏览器抓取与自动化',
    };

    // Every skill lands in exactly one section. `builtin` / `plugin` /
    // `global` / `other` are derived automatically from the Host-published
    // path; any other section id belongs to a section the user created and
    // only receives skills the user moved there explicitly.
    const FIXED_SECTIONS = [
      { id: 'builtin', name: '内置技能', hint: 'DeepSeek Harness 自带' },
      { id: 'plugin', name: '插件技能', hint: '已安装插件提供' },
      { id: 'global', name: '我的技能', hint: '全局 skills 目录' },
      { id: 'other', name: '其他', hint: '未能识别来源' },
    ];

    // Fallback classification for Host builds that omit `path`.
    const BUILTIN_NAMES = [
      'agent-experience',
      'cordis-composition-reference',
      'cordis-plugin-development',
      'editing-cordis-compositions',
      'diagnose-windows-sandbox-acl',
      'office',
      'office-docx',
      'office-export-pdf',
      'office-pptx',
      'office-recalculate',
      'office-render',
      'office-xlsx',
    ];
    const GLOBAL_NAMES = ['chinese-ppt-deck', 'learning-content-vetting', 'physics-lab-report-docx', 'ppt-master'];

    const SECTIONS_KEY = 'dsh-skill-picker.sections';
    const ASSIGN_KEY = 'dsh-skill-picker.assign';
    const RATINGS_KEY = 'dsh-skill-picker.ratings';
    const ORDER_KEY = 'dsh-skill-picker.order';

    function readOrder() {
      try {
        const raw = window.localStorage.getItem(ORDER_KEY);
        const value = raw ? JSON.parse(raw) : [];
        return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [];
      } catch {
        return [];
      }
    }

    function readJson(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return fallback;
        const value = JSON.parse(raw);
        return value && typeof value === 'object' ? value : fallback;
      } catch {
        return fallback;
      }
    }

    function writeJson(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* storage disabled: the in-memory copy still works this session */
      }
    }

    function readSections() {
      const value = readJson(SECTIONS_KEY, []);
      if (!Array.isArray(value)) return [];
      return value
        .filter((entry) => entry && typeof entry.id === 'string' && typeof entry.name === 'string')
        .map((entry) => ({ id: entry.id, name: entry.name }));
    }

    function autoSectionId(skill) {      const path = typeof skill.path === 'string' ? skill.path : '';
      if (path.length > 0) {
        if (/app\.asar/i.test(path)) return 'builtin';
        if (/[\\/]node_modules[\\/]/i.test(path)) return 'plugin';
        if (/[\\/]skills[\\/]/i.test(path)) return 'global';
        return 'other';
      }
      if (BUILTIN_NAMES.includes(skill.name)) return 'builtin';
      if (GLOBAL_NAMES.includes(skill.name)) return 'global';
      return 'plugin';
    }

    const CSS = `
.dskp-trigger{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border:0;border-radius:999px;background:var(--dsw-specific-selector,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:1;white-space:nowrap;cursor:pointer;flex:none}
.dskp-trigger:hover{background:var(--dsw-alias-interactive-bg-hover-solid,rgba(127,127,127,.24))}
.dskp-trigger[${HOVER_ATTR}=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.24))}
.dskp-trigger svg{width:14px;height:14px;display:block;flex:none}
.dskp-pop{position:fixed;z-index:6000;box-sizing:border-box;width:428px;max-width:calc(100vw - 16px);max-height:min(560px,calc(100vh - 24px));display:flex;flex-direction:column;padding:10px;border-radius:14px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1,#202024));color:var(--dsw-alias-label-primary);border:.5px solid var(--dsw-alias-border-l1,rgba(127,127,127,.28));box-shadow:0 18px 44px rgba(0,0,0,.4),0 2px 8px rgba(0,0,0,.24);font-size:13px;text-align:left}
.dskp-head{display:flex;align-items:center;gap:8px;padding:2px 4px 8px;margin-bottom:6px;font-size:14px;font-weight:600;border-bottom:.5px solid var(--dsw-alias-border-l1,rgba(127,127,127,.24))}
.dskp-lang{display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:7px;background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.12))}
.dskp-lang-btn{height:18px;padding:0 6px;border:0;border-radius:5px;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;font-weight:400;line-height:18px;cursor:pointer}
.dskp-lang-btn[data-on=true]{background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-overlay,rgba(127,127,127,.28)));color:var(--dsw-alias-label-primary);font-weight:600}
.dskp-item[data-active=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16))}
.dskp-count{margin-left:auto;font-weight:400;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dskp-search{box-sizing:border-box;width:100%;height:28px;margin:0 0 6px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.3));border-radius:8px;background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.08));color:inherit;font:inherit;font-size:12px;outline:none}
.dskp-search:focus{border-color:var(--dsw-alias-brand-primary,#4d7cfe)}
.dskp-list{display:flex;flex-direction:column;gap:2px;min-height:0;flex:1;overflow-y:auto}
.dskp-item{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:6px;width:100%;box-sizing:border-box;padding:6px 8px;border:0;border-radius:8px;background:0 0;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dskp-row{display:flex;flex-direction:column;min-width:0;flex:1}
.dskp-move{flex:none;width:24px;height:24px;display:grid;place-items:center;border:0;border-radius:6px;background:0 0;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:1;cursor:pointer;opacity:.45;transition:opacity .1s}
.dskp-item:hover .dskp-move,.dskp-item[data-active=true] .dskp-move,.dskp-move:focus-visible{opacity:1}
.dskp-move:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.22));color:var(--dsw-alias-label-primary)}
.dskp-menu{position:absolute;z-index:5;top:calc(100% - 4px);right:6px;min-width:132px;max-height:200px;overflow-y:auto;display:flex;flex-direction:column;padding:4px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-overlay,#26262a));border:.5px solid var(--dsw-alias-border-l1,rgba(127,127,127,.3));box-shadow:0 10px 24px rgba(0,0,0,.32)}
.dskp-menu-item{display:block;width:100%;box-sizing:border-box;padding:5px 8px;border:0;border-radius:6px;background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;text-align:left;cursor:pointer;white-space:nowrap}
.dskp-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.2))}
.dskp-menu-item[data-on=true]{font-weight:600;color:var(--dsw-alias-brand-primary,#7aa2ff)}
.dskp-group{display:flex;flex-direction:column;gap:2px}
.dskp-group+.dskp-group{margin-top:6px;padding-top:4px;border-top:.5px solid var(--dsw-alias-border-l1,rgba(127,127,127,.18))}
.dskp-section{display:flex;align-items:center;gap:3px;padding:8px 6px 3px}
.dskp-section-main{display:flex;align-items:center;gap:6px;min-width:0;flex:1;cursor:pointer}
.dskp-caret{flex:none;width:10px;font-size:9px;line-height:1;color:var(--dsw-alias-label-secondary)}
.dskp-caret[data-collapsed=true]{opacity:.8}
.dskp-section-name{font-size:12px;font-weight:700;letter-spacing:.04em;color:var(--dsw-alias-state-warn-primary,#e08a3c);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dskp-section:hover .dskp-section-name{filter:brightness(1.12)}
.dskp-section-count{font-size:10px;line-height:15px;padding:0 4px;border-radius:4px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.14))}
.dskp-section-input{min-width:0;flex:1;height:20px;padding:0 6px;border:1px solid var(--dsw-alias-brand-primary,#4d7cfe);border-radius:5px;background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.1));color:inherit;font:inherit;font-size:11px;outline:none}
.dskp-section-act{flex:none;width:22px;height:22px;display:grid;place-items:center;border:0;border-radius:6px;background:0 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1;cursor:pointer}
.dskp-section-act:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.22));color:var(--dsw-alias-label-primary)}
.dskp-section-act:disabled{opacity:.22;cursor:default;background:0 0;color:var(--dsw-alias-label-secondary)}
.dskp-order{opacity:.5;transition:opacity .1s}
.dskp-section:hover .dskp-order,.dskp-order:focus-visible{opacity:1}
.dskp-section:hover .dskp-order:disabled{opacity:.28}
.dskp-side{flex:none;display:flex;align-items:center;gap:4px}
.dskp-stars{display:inline-flex;align-items:center;gap:1px}
.dskp-item .dskp-stars[data-empty=true]{opacity:.3}
.dskp-item:hover .dskp-stars[data-empty=true],.dskp-item[data-active=true] .dskp-stars[data-empty=true]{opacity:1}
.dskp-star{width:17px;height:20px;padding:0;border:0;background:0 0;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:20px;cursor:pointer}
.dskp-star[data-on=true]{color:var(--dsw-alias-state-warn-primary,#f0b429)}
.dskp-star:hover{transform:scale(1.15)}
.dskp-note-btn{flex:none;width:22px;height:22px;display:grid;place-items:center;border:0;border-radius:6px;background:0 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1;cursor:pointer;opacity:.45;transition:opacity .1s}
.dskp-item:hover .dskp-note-btn,.dskp-item[data-active=true] .dskp-note-btn,.dskp-note-btn[data-on=true],.dskp-note-btn:focus-visible{opacity:1}
.dskp-note-btn[data-on=true]{color:var(--dsw-alias-brand-primary,#7aa2ff)}
.dskp-note-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.22));color:var(--dsw-alias-label-primary)}
.dskp-rnote{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-style:italic}
.dskp-note-edit{flex-basis:100%;padding:2px 0 2px 8px}
.dskp-note-input{box-sizing:border-box;width:100%;padding:5px 7px;border:1px solid var(--dsw-alias-brand-primary,#4d7cfe);border-radius:7px;background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.1));color:inherit;font:inherit;font-size:12px;line-height:17px;resize:vertical;outline:none}
.dskp-addbtn{flex:none;height:20px;padding:0 7px;border:0;border-radius:6px;background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.14));color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;font-weight:400;line-height:20px;cursor:pointer}
.dskp-addbtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.24));color:var(--dsw-alias-label-primary)}
.dskp-item:hover,.dskp-item:focus-visible{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));outline:none}
.dskp-name{display:flex;align-items:center;gap:6px;font-size:13px;line-height:20px;font-weight:500}
.dskp-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dskp-tag{padding:0 5px;border-radius:4px;font-size:10px;font-weight:400;line-height:15px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.35))}
.dskp-note{padding:14px 8px;text-align:center;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);word-break:break-word}
.dskp-note[data-error=true]{color:var(--dsw-alias-state-error-primary,#e5484d)}
.dskp-foot{padding:6px 4px 0;font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary)}
`;

    function readLang() {
      try {
        return window.localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'zh';
      } catch {
        return 'zh';
      }
    }

    function writeLang(lang) {
      try {
        window.localStorage.setItem(LANG_KEY, lang);
      } catch {
        /* private mode / storage disabled: keep the in-memory choice */
      }
    }

    const state = {
      open: false,
      anchor: null,
      sessionId: '',
      skills: [],
      loading: false,
      error: '',
      filter: '',
      loaded: false,
      lang: readLang(),
      active: '',
      // user-created sections: [{ id, name }]
      sections: readSections(),
      // explicit overrides: { [skillName]: sectionId }
      assign: readJson(ASSIGN_KEY, {}),
      // { [skillName]: { stars: 1-5, note: '…' } }
      ratings: readJson(RATINGS_KEY, {}),
      // section ids in display order
      order: readOrder(),
      noteFor: '',
      noteDraft: '',
      collapsed: {},
      menuFor: '',
      editing: '',
      draftName: '',
    };

    const listeners = new Set();
    let ctxRef = null;
    // Latest composer bindings, captured from the tool-row render.
    const live = { inputActions: undefined, draft: '' };

    function notify() {
      for (const fn of [...listeners]) {
        try {
          fn();
        } catch (error) {
          console.error('[dsh-skill-picker]', error);
        }
      }
    }

    function subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    }

    function usePicker() {
      const [, bump] = React.useReducer((n) => n + 1, 0);
      React.useEffect(() => subscribe(bump), []);
      return state;
    }

    function service(name) {
      const scope = ctxRef;
      if (!scope || typeof scope.get !== 'function') return undefined;
      try {
        return scope.get(name);
      } catch {
        return undefined;
      }
    }

    function shorten(text, max) {
      const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
      if (flat.length === 0) return '';
      return flat.length > max ? `${flat.slice(0, max)}…` : flat;
    }

    // One-line intro for a row. The skill NAME is never translated; only this
    // text changes with the 中文/English switch.
    function introFor(skill, lang) {
      const zh = typeof ZH_INTROS[skill.name] === 'string' ? ZH_INTROS[skill.name] : '';
      const en = shorten(skill.description, INTRO_MAX);
      if (lang === 'zh') return shorten(zh, INTRO_MAX) || en || '暂无简介';
      return en || shorten(zh, INTRO_MAX) || 'No description';
    }

    function messageOf(error) {
      if (error instanceof Error) return error.message;
      if (error && typeof error === 'object' && typeof error.message === 'string') return error.message;
      return String(error);
    }

    async function fetchFromClient(sessionId) {
      const sessions = service('sessions');
      const catalog = service('remote.skills');
      if (!catalog || !sessions || typeof catalog.list !== 'function') return undefined;
      let binding;
      try {
        binding = sessions.binding(sessionId);
      } catch {
        return undefined;
      }
      if (binding === undefined) return undefined;
      return sessions.using(sessionId, { source: 'skillCatalog' }, async (reference) => {
        const snapshot = reference.binding.session.getSnapshot();
        if (snapshot.openState !== 'open') throw new Error(snapshot.openError?.message ?? 'session is not open');
        const result = await catalog.list({ sessionId });
        if (!result || result.ok !== true) {
          const reason = result && result.error ? `${result.error.code}: ${result.error.message}` : 'unknown error';
          throw new Error(`skills/list failed: ${reason}`);
        }
        return result.value.skills;
      });
    }

    async function fetchFromHost(sessionId) {
      const connection = service('connection');
      if (!connection || !connection.rpc || typeof connection.rpc.call !== 'function') {
        throw new Error('no connection service');
      }
      const result = await connection.rpc.call(CHANNEL, 'list', { sessionId });
      if (!result || result.ok !== true) {
        throw new Error(result && result.error ? result.error.message : 'skills/list failed');
      }
      return result.value.skills;
    }

    async function loadSkills(sessionId) {
      state.loading = true;
      state.error = '';
      notify();
      let failure;
      try {
        let skills = await fetchFromClient(sessionId);
        if (skills === undefined) skills = await fetchFromHost(sessionId);
        state.skills = Array.isArray(skills) ? skills : [];
        state.loaded = true;
      } catch (error) {
        failure = error;
        try {
          state.skills = (await fetchFromHost(sessionId)) ?? [];
          state.loaded = true;
          failure = undefined;
        } catch (again) {
          failure = failure ?? again;
        }
      }
      if (failure !== undefined) {
        state.error = messageOf(failure);
        state.skills = [];
      }
      state.loading = false;
      notify();
    }

    function openPicker(anchor, sessionId) {
      state.open = true;
      state.anchor = anchor;
      state.sessionId = typeof sessionId === 'string' ? sessionId : '';
      state.filter = '';
      notify();
      loadSkills(state.sessionId);
    }

    function closePicker() {
      if (!state.open) return;
      state.open = false;
      state.menuFor = '';
      state.noteFor = '';
      state.noteDraft = '';
      notify();
    }

    function togglePicker(anchor, sessionId) {
      if (state.open) closePicker();
      else openPicker(anchor, sessionId);
    }

    function insertSkill(name) {
      const token = `/${name} `;
      const actions = live.inputActions;
      const draft = typeof live.draft === 'string' ? live.draft : '';
      if (actions && typeof actions.captureInsertion === 'function' && typeof actions.insertText === 'function') {
        try {
          const span = actions.captureInsertion();
          if (span && typeof span.start === 'number') {
            const before = draft.slice(0, span.start);
            const needsGap = before.length > 0 && !/\s$/.test(before);
            if (actions.insertText(needsGap ? ` ${token}` : token, span)) return true;
          }
        } catch (error) {
          console.error('[dsh-skill-picker] insert failed', error);
        }
      }
      if (actions && typeof actions.setDraft === 'function') {
        const head = draft.replace(/\s+$/, '');
        actions.setDraft(head.length === 0 ? token : `${head} ${token}`);
        return true;
      }
      return false;
    }

    function filteredSkills() {
      const needle = state.filter.trim().toLowerCase();
      if (needle.length === 0) return state.skills;
      return state.skills.filter((skill) => {
        const hay = `${skill.name} ${skill.description ?? ''} ${skill.whenToUse ?? ''}`.toLowerCase();
        return hay.includes(needle);
      });
    }

    function sectionList() {
      const all = [
        ...FIXED_SECTIONS.map((section) => ({ ...section, custom: false })),
        ...state.sections.map((section) => ({ id: section.id, name: section.name, hint: '自定义分区', custom: true })),
      ];
      if (state.order.length === 0) return all;
      const index = new Map(state.order.map((id, position) => [id, position]));
      const arranged = all.filter((section) => index.has(section.id)).sort((a, b) => index.get(a.id) - index.get(b.id));
      const trailing = all.filter((section) => !index.has(section.id));
      return [...arranged, ...trailing];
    }

    // Reorders sections one step; the whole visible order is then persisted.
    function moveSection(id, step) {
      const ids = sectionList().map((section) => section.id);
      const from = ids.indexOf(id);
      const to = from + step;
      if (from < 0 || to < 0 || to >= ids.length) return;
      const moved = ids.slice();
      moved[from] = ids[to];
      moved[to] = ids[from];
      state.order = moved;
      writeJson(ORDER_KEY, moved);
      notify();
    }

    function setRating(name, stars) {
      const current = state.ratings[name] || {};
      const value = current.stars === stars ? 0 : stars;
      const next = { ...state.ratings };
      if (value === 0 && !current.note) delete next[name];
      else next[name] = { ...current, stars: value };
      state.ratings = next;
      writeJson(RATINGS_KEY, next);
      notify();
    }

    function setNote(name, text) {
      const current = state.ratings[name] || {};
      const trimmed = String(text ?? '').replace(/\s+$/, '').slice(0, 200);
      const next = { ...state.ratings };
      if (trimmed.length === 0 && !current.stars) delete next[name];
      else next[name] = { ...current, note: trimmed };
      state.ratings = next;
      writeJson(RATINGS_KEY, next);
      notify();
    }

    function sectionOf(skill) {
      const assigned = state.assign[skill.name];
      if (typeof assigned === 'string' && sectionList().some((section) => section.id === assigned)) return assigned;
      return autoSectionId(skill);
    }

    function groupedSkills(rows) {
      const buckets = new Map();
      for (const skill of rows) {
        const id = sectionOf(skill);
        const bucket = buckets.get(id);
        if (bucket) bucket.push(skill);
        else buckets.set(id, [skill]);
      }
      return sectionList()
        .map((section) => ({ ...section, skills: buckets.get(section.id) ?? [] }))
        .filter((section) => section.skills.length > 0 || section.custom);
    }

    function assignSkill(name, sectionId) {
      const next = { ...state.assign };
      if (typeof sectionId !== 'string' || sectionId.length === 0) delete next[name];
      else next[name] = sectionId;
      state.assign = next;
      state.menuFor = '';
      writeJson(ASSIGN_KEY, next);
      notify();
    }

    function addSection() {
      const id = `s${Date.now().toString(36)}`;
      state.sections = [...state.sections, { id, name: '新分区' }];
      writeJson(SECTIONS_KEY, state.sections);
      state.editing = id;
      state.draftName = '新分区';
      notify();
    }

    function commitSectionName(id, name) {
      const trimmed = String(name ?? '').trim();
      state.sections = state.sections.map((section) => (section.id === id ? { ...section, name: trimmed.length > 0 ? trimmed : section.name } : section));
      state.editing = '';
      state.draftName = '';
      writeJson(SECTIONS_KEY, state.sections);
      notify();
    }

    function removeSection(id) {
      state.sections = state.sections.filter((section) => section.id !== id);
      state.order = state.order.filter((entry) => entry !== id);
      const next = {};
      for (const [name, sectionId] of Object.entries(state.assign)) if (sectionId !== id) next[name] = sectionId;
      state.assign = next;
      if (state.editing === id) {
        state.editing = '';
        state.draftName = '';
      }
      writeJson(SECTIONS_KEY, state.sections);
      writeJson(ORDER_KEY, state.order);
      writeJson(ASSIGN_KEY, next);
      notify();
    }

    function toggleCollapsed(id) {
      state.collapsed = { ...state.collapsed, [id]: !state.collapsed[id] };
      notify();
    }

    // Keeps a rendering problem in this plugin from taking down the composer.
    class Boundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }
      static getDerivedStateFromError() {
        return { failed: true };
      }
      componentDidCatch(error) {
        console.error('[dsh-skill-picker]', error);
      }
      render() {
        return this.state.failed ? null : this.props.children;
      }
    }

    function guarded(Inner) {
      return function GuardedSlot(props) {
        return h(Boundary, null, h(Inner, props));
      };
    }

    function SkillIcon() {
      return h(
        'svg',
        { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M5 4.5h9.5L19 9v10.5H5z' }),
        h('path', { d: 'M14 4.5V9h4.5' }),
        h('path', { d: 'M12.2 12.2l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7z', fill: 'currentColor', stroke: 'none' }),
      );
    }

    function Trigger(props) {
      const snapshot = usePicker();
      const buttonRef = React.useRef(null);
      const sessionId = props.sessionId;

      let draft = '';
      if (typeof props.useInput === 'function') {
        try {
          const input = props.useInput((value) => value);
          if (input && typeof input.draft === 'string') draft = input.draft;
        } catch {
          draft = '';
        }
      }
      live.inputActions = props.inputActions;
      live.draft = draft;

      const onClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        togglePicker(buttonRef.current, sessionId);
      };

      return h(
        React.Fragment,
        null,
        h('style', null, CSS),
        h(
          'button',
          {
            type: 'button',
            ref: buttonRef,
            className: 'dskp-trigger',
            [HOVER_ATTR]: snapshot.open ? 'true' : 'false',
            'aria-haspopup': 'dialog',
            'aria-expanded': snapshot.open,
            title: '技能：点击查看，双击技能即可插入当前对话',
            onMouseDown: (event) => event.preventDefault(),
            onClick,
          },
          h(SkillIcon),
          h('span', null, '技能'),
        ),
      );
    }

    function Stars(props) {
      const value = props.value || 0;
      const stars = [];
      for (let index = 1; index <= 5; index += 1) {
        stars.push(
          h(
            'button',
            {
              key: index,
              type: 'button',
              className: 'dskp-star',
              'data-on': index <= value ? 'true' : 'false',
              title: index === value ? '取消评分' : `评 ${index} 星`,
              onClick: (event) => {
                event.preventDefault();
                event.stopPropagation();
                props.onRate(index);
              },
            },
            index <= value ? '★' : '☆',
          ),
        );
      }
      return h('span', { className: 'dskp-stars', 'data-empty': value ? 'false' : 'true' }, stars);
    }

    function Row(props) {
      const skill = props.skill;
      const lang = props.lang;
      const intro = introFor(skill, lang);
      const rating = props.rating || {};
      const menu = props.menuOpen
        ? h(
            'div',
            { className: 'dskp-menu' },
            h(
              'button',
              {
                type: 'button',
                className: 'dskp-menu-item',
                'data-on': props.moved ? 'false' : 'true',
                onClick: (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  props.onAssign(skill.name, '');
                },
              },
              '自动分类',
            ),
            props.sections.map((section) =>
              h(
                'button',
                {
                  key: section.id,
                  type: 'button',
                  className: 'dskp-menu-item',
                  'data-on': section.id === props.sectionId ? 'true' : 'false',
                  onClick: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    props.onAssign(skill.name, section.id);
                  },
                },
                section.name,
              ),
            ),
          )
        : null;
      const editor = props.noteOpen
        ? h(
            'div',
            {
              className: 'dskp-note-edit',
              onClick: (event) => {
                event.preventDefault();
                event.stopPropagation();
              },
            },
            h('textarea', {
              className: 'dskp-note-input',
              rows: 2,
              value: props.noteDraft,
              placeholder: '写点备注：这技能哪儿好用、什么情况下别用…',
              onChange: (event) => props.onNoteDraft(event.target.value),
              onKeyDown: (event) => {
                event.stopPropagation();
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  props.onNoteSave();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  props.onNoteClose();
                }
              },
            }),
          )
        : null;
      return h(
        'div',
        {
          className: 'dskp-item',
          'data-active': props.active ? 'true' : 'false',
          'data-rated': rating.stars ? 'true' : 'false',
          role: 'button',
          tabIndex: 0,
          onClick: () => props.onSelect(skill),
          onDoubleClick: () => props.onPick(skill),
        },
        h(
          'span',
          { className: 'dskp-row' },
          h(
            'span',
            { className: 'dskp-name' },
            h('span', null, skill.name),
            skill.modelInvocable === false ? h('span', { className: 'dskp-tag' }, '用户专用') : null,
          ),
          h('span', { className: 'dskp-desc' }, intro),
          rating.note ? h('span', { className: 'dskp-rnote' }, rating.note) : null,
        ),
        h(
          'span',
          { className: 'dskp-side' },
          h(Stars, {
            value: rating.stars || 0,
            onRate: (value) => props.onRate(skill.name, value),
          }),
          h(
            'button',
            {
              type: 'button',
              className: 'dskp-note-btn',
              'data-on': rating.note ? 'true' : 'false',
              title: rating.note ? '编辑备注' : '添加备注',
              onClick: (event) => {
                event.preventDefault();
                event.stopPropagation();
                props.onNoteToggle(skill);
              },
            },
            '✎',
          ),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dskp-move',
            title: '移动到其他分区',
            onClick: (event) => {
              event.preventDefault();
              event.stopPropagation();
              props.onMenu(skill.name);
            },
          },
          '⇄',
        ),
        editor,
        menu,
      );
    }

    function Popover() {
      const snapshot = usePicker();
      const popRef = React.useRef(null);
      const searchRef = React.useRef(null);

      React.useLayoutEffect(() => {
        const node = popRef.current;
        const anchor = snapshot.anchor;
        if (!snapshot.open || !node || !anchor || typeof anchor.getBoundingClientRect !== 'function') return;
        const rect = anchor.getBoundingClientRect();
        const box = node.getBoundingClientRect();
        const margin = 8;
        let top = rect.bottom + 6;
        if (top + box.height > window.innerHeight - margin) top = Math.max(margin, rect.top - box.height - 6);
        const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - box.width - margin));
        node.style.top = `${Math.round(top)}px`;
        node.style.left = `${Math.round(left)}px`;
      });

      React.useEffect(() => {
        if (!snapshot.open) return undefined;
        const onDown = (event) => {
          const node = popRef.current;
          const anchor = snapshot.anchor;
          const target = event.target;
          if (node && node.contains(target)) {
            // An open per-row section menu closes on any click that is neither
            // inside the menu nor on the row's own toggle button.
            if (state.menuFor !== '' && target instanceof Element) {
              if (target.closest('.dskp-menu') === null && target.closest('.dskp-move') === null) {
                state.menuFor = '';
                notify();
              }
            }
            return;
          }
          if (anchor && typeof anchor.contains === 'function' && anchor.contains(target)) return;
          closePicker();
        };
        const onKey = (event) => {
          if (event.key === 'Escape' && event.target instanceof Element && event.target.classList.contains('dskp-note-input')) {
            return;
          }
          if (event.key === 'Escape') {
            event.stopPropagation();
            if (state.menuFor !== '') {
              state.menuFor = '';
              notify();
              return;
            }
            if (state.editing !== '') {
              state.editing = '';
              state.draftName = '';
              notify();
              return;
            }
            closePicker();
          }
        };
        const onResize = () => closePicker();
        const timer = setTimeout(() => searchRef.current?.focus(), 0);
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', onResize);
        return () => {
          clearTimeout(timer);
          document.removeEventListener('mousedown', onDown, true);
          document.removeEventListener('keydown', onKey, true);
          window.removeEventListener('resize', onResize);
        };
      }, [snapshot.open]);

      if (!snapshot.open) return null;

      const rows = filteredSkills();
      const onPick = (skill) => {
        insertSkill(skill.name);
        closePicker();
      };
      const onSelect = (skill) => {
        state.active = state.active === skill.name ? '' : skill.name;
        notify();
      };
      const onSearchKey = (event) => {
        if (event.key === 'Enter') {
          const target = rows.find((skill) => skill.name === state.active) ?? rows[0];
          if (target) {
            event.preventDefault();
            onPick(target);
          }
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          if (rows.length === 0) return;
          event.preventDefault();
          const index = rows.findIndex((skill) => skill.name === state.active);
          const step = event.key === 'ArrowDown' ? 1 : -1;
          const next = index < 0 ? (step > 0 ? 0 : rows.length - 1) : (index + step + rows.length) % rows.length;
          state.active = rows[next].name;
          notify();
        }
      };
      const setLang = (lang) => {
        if (state.lang === lang) return;
        state.lang = lang;
        writeLang(lang);
        notify();
      };
      const onMenu = (name) => {
        state.menuFor = state.menuFor === name ? '' : name;
        notify();
      };
      const onAssign = (name, sectionId) => assignSkill(name, sectionId);
      const onRate = (name, value) => setRating(name, value);
      const onNoteToggle = (skill) => {
        if (state.noteFor === skill.name) {
          state.noteFor = '';
          state.noteDraft = '';
        } else {
          state.noteFor = skill.name;
          state.noteDraft = (state.ratings[skill.name] || {}).note || '';
        }
        state.menuFor = '';
        notify();
      };
      const onNoteDraft = (text) => {
        state.noteDraft = text;
        notify();
      };
      const onNoteSave = () => {
        const name = state.noteFor;
        if (name === '') return;
        const text = state.noteDraft;
        state.noteFor = '';
        state.noteDraft = '';
        setNote(name, text);
      };
      const onNoteClose = () => {
        state.noteFor = '';
        state.noteDraft = '';
        notify();
      };

      let body;
      if (snapshot.loading) {
        body = h('div', { className: 'dskp-note' }, '正在读取技能…');
      } else if (snapshot.error) {
        body = h('div', { className: 'dskp-note', 'data-error': 'true' }, `读取技能失败：${snapshot.error}`);
      } else if (rows.length === 0) {
        body = h('div', { className: 'dskp-note' }, snapshot.skills.length === 0 ? '当前没有可用技能' : '没有匹配的技能');
      } else {
        const sections = sectionList();
        const groups = groupedSkills(rows);
        body = h(
          'div',
          { className: 'dskp-list' },
          groups.map((group, groupIndex) => {
            const collapsed = snapshot.collapsed[group.id] === true;
            const editing = snapshot.editing === group.id;
            return h(
              'div',
              { className: 'dskp-group', key: group.id },
              h(
                'div',
                { className: 'dskp-section' },
                h(
                  'div',
                  { className: 'dskp-section-main', onClick: () => toggleCollapsed(group.id) },
                  h('span', { className: 'dskp-caret', 'data-collapsed': collapsed ? 'true' : 'false' }, collapsed ? '▸' : '▾'),
                  editing
                    ? h('input', {
                        className: 'dskp-section-input',
                        value: snapshot.draftName,
                        autoFocus: true,
                        onClick: (event) => event.stopPropagation(),
                        onChange: (event) => {
                          state.draftName = event.target.value;
                          notify();
                        },
                        onKeyDown: (event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            commitSectionName(group.id, state.draftName);
                          } else if (event.key === 'Escape') {
                            event.preventDefault();
                            event.stopPropagation();
                            state.editing = '';
                            state.draftName = '';
                            notify();
                          }
                        },
                        onBlur: () => commitSectionName(group.id, state.draftName),
                      })
                    : h('span', { className: 'dskp-section-name' }, group.name),
                  h('span', { className: 'dskp-section-count' }, String(group.skills.length)),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dskp-section-act dskp-order',
                    title: '分区上移',
                    disabled: groupIndex === 0,
                    onClick: (event) => {
                      event.stopPropagation();
                      moveSection(group.id, -1);
                    },
                  },
                  '↑',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dskp-section-act dskp-order',
                    title: '分区下移',
                    disabled: groupIndex >= groups.length - 1,
                    onClick: (event) => {
                      event.stopPropagation();
                      moveSection(group.id, 1);
                    },
                  },
                  '↓',
                ),
                group.custom && !editing
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'dskp-section-act',
                        title: '重命名分区',
                        onClick: (event) => {
                          event.stopPropagation();
                          state.editing = group.id;
                          state.draftName = group.name;
                          notify();
                        },
                      },
                      '✎',
                    )
                  : null,
                group.custom
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'dskp-section-act',
                        title: '删除分区（里面的技能回到自动分类）',
                        onClick: (event) => {
                          event.stopPropagation();
                          removeSection(group.id);
                        },
                      },
                      '×',
                    )
                  : null,
              ),
              collapsed
                ? null
                : group.skills.map((skill) =>
                    h(Row, {
                      key: skill.name,
                      skill,
                      lang: snapshot.lang,
                      active: snapshot.active === skill.name,
                      sections,
                      sectionId: group.id,
                      moved: typeof snapshot.assign[skill.name] === 'string',
                      menuOpen: snapshot.menuFor === skill.name,
                      rating: snapshot.ratings[skill.name],
                      noteOpen: snapshot.noteFor === skill.name,
                      noteDraft: snapshot.noteDraft,
                      onRate,
                      onNoteToggle,
                      onNoteDraft,
                      onNoteSave,
                      onNoteClose,
                      onSelect,
                      onPick,
                      onMenu,
                      onAssign,
                    }),
                  ),
            );
          }),
        );
      }

      return createPortal(
        h(
          'div',
          { className: 'dskp-pop', ref: popRef, role: 'dialog', 'aria-label': '技能' },
          h(
            'div',
            { className: 'dskp-head' },
            h('span', null, '技能'),
            h(
              'span',
              { className: 'dskp-lang' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dskp-lang-btn',
                  'data-on': snapshot.lang === 'zh' ? 'true' : 'false',
                  onClick: () => setLang('zh'),
                },
                '中文',
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dskp-lang-btn',
                  'data-on': snapshot.lang === 'en' ? 'true' : 'false',
                  onClick: () => setLang('en'),
                },
                'EN',
              ),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dskp-addbtn',
                title: '新建自定义分区',
                onClick: (event) => {
                  event.stopPropagation();
                  addSection();
                },
              },
              '＋分区',
            ),
            h('span', { className: 'dskp-count' }, snapshot.loading ? '' : `${rows.length} 个`),
          ),
          snapshot.loading || snapshot.error
            ? null
            : h('input', {
                ref: searchRef,
                className: 'dskp-search',
                type: 'text',
                placeholder: snapshot.lang === 'en' ? 'Search skills…' : '搜索技能或简介…',
                value: snapshot.filter,
                onChange: (event) => {
                  state.filter = event.target.value;
                  notify();
                },
                onKeyDown: onSearchKey,
              }),
          body,
          h('div', { className: 'dskp-foot' }, '⇄ 移动分区 · 双击插入 · 回车发送即调用'),
        ),
        document.body,
      );
    }

    return {
      // `remote.skills` is the Host-backed skill catalog (same service the
      // built-in skill menu reads); `connection` is the RPC carrier used as a
      // fallback when the catalog itself is unavailable.
      inject: ['slots', 'sessions', 'connection', 'remote.skills'],
      apply(ctx) {
        ctxRef = ctx;
        const mount = (slot, id, order, component) => {
          try {
            ctx.slots.inject(slot, () =>
              ctx.slots.register({ name: slot, id, order }, guarded(component)),
            );
          } catch (error) {
            console.error('[dsh-skill-picker] cannot mount', slot, error);
          }
        };
        mount('conversation.input.left', 'dsh-skill-picker', 20, Trigger);
        mount('conversation.input.overlay', 'dsh-skill-picker-popover', 20, Popover);
        ctx.effect(
          () => () => {
            ctxRef = null;
          },
          'dsh-skill-picker: state reset',
        );
      },
    };
  },
});
