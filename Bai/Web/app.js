'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const button = (text, action, primary = false) => `<button class="el-button${primary ? ' el-button--primary' : ''}" data-action="${action}">${escape(text)}</button>`;
  const groups = [['policy', '脚本策略'], ['limit', '运行限制'], ['trad', '传统模式'], ['bg', '酒馆战棋'], ['arena', '竞技场']];
  let state, page = 'console', settingsBuilt = false, lastGrid = '', lastStats = '', logOpen = false;
  const accountNodes = new Map();
  const detailAccountNodes = new Map();
  const statsAccountNodes = new Map();
  const settingsAccountNodes = new Map();
  let statsListSignature = '';
  let detailListSignature = '', detailSignature = '';
  let columnSignature = '', versionNotes = '', settingsSignature = '', licenseSignature = '';
  const layoutKey = 'hskeeper-layout-v1';
  let layout;
  try { layout = JSON.parse(localStorage.getItem(layoutKey) || '{}'); } catch (_) { layout = {}; }
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) layout = {};
  layout.widths = layout.widths && typeof layout.widths === 'object' ? layout.widths : {};
  layout.collapsed = layout.collapsed && typeof layout.collapsed === 'object' ? layout.collapsed : {};
  const saveLayout = () => { try { localStorage.setItem(layoutKey, JSON.stringify(layout)); } catch (_) { toast('界面偏好暂时无法保存，下次启动可能恢复默认。', true); } };
  const defaultWidths = {Selected:42,Sequence:58,Account:190,AutoRun:56,ScheduleRange:190,ScriptToggle:96,ClientToggle:96,
    RunMode:110,AccountStrategy:150,ConstructedDeck:190,AccountResources:252,AccountRanks:224,RuntimeStatus:170,
    Note:180,AccountExpiry:170,Token:76,Region:64,NewcomerTutorial:90,RefreshToken:88,HearthstonePath:280};
  function columnWidth(key) {
    const saved = layout.widths[key];
    return Number.isFinite(saved) ? Math.max(42, Math.min(800, saved)) : defaultWidths[key] || 130;
  }
  function sizeColumns() {
    const table = $('#page-console table');
    let total = 0;
    table.querySelectorAll('col[data-column-key]').forEach(col => {
      const width = columnWidth(col.dataset.columnKey); col.style.width = width + 'px'; total += width;
    });
    table.style.width = total + 'px';
    table.querySelectorAll('.column-resizer').forEach(handle => handle.setAttribute('aria-valuenow', columnWidth(handle.dataset.resizeColumn)));
  }
  function applySidebar(name) {
    const root = $('#page-' + name), collapsed = layout.collapsed[name] === true;
    root.classList.toggle('sidebar-collapsed', collapsed);
    root.querySelector('aside').hidden = collapsed;
    const toggle = root.querySelector('.sidebar-toggle');
    toggle.textContent = collapsed ? '› 展开账号列表' : '‹ 收起账号列表';
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.title = collapsed ? '展开左侧账号列表，切换账号' : '收起左侧账号列表，扩大内容区域';
  }
  const request = async (command, args = {}) => {
    try { return await bai.request(command, args); }
    catch (error) { toast(error.message, true); throw error; }
  };
  const fire = (command, args) => { request(command, args).catch(() => {}); };
  function toast(message, error = false) {
    let toast = $('#toast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; toast.setAttribute('role', 'status'); document.body.append(toast); }
    toast.textContent = message; toast.classList.toggle('error', error); toast.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => toast.classList.remove('show'), 5000);
  }
  function setText(selector, text) { const element = $(selector), value = String(text ?? ''); if (element && element.textContent !== value) element.textContent = value; }
  function control(setting) {
    const key = escape(setting.key), label = escape(setting.label);
    if (setting.type === 'switch') return `<button class="el-switch" role="switch" aria-checked="false" aria-label="${label}" data-setting="${key}"></button>`;
    if (setting.type === 'select') return `<select class="native-select" aria-label="${label}" data-setting="${key}">${setting.options.map((v, i) => `<option value="${i}">${escape(v)}</option>`).join('')}</select>`;
    if (setting.type === 'number') return `<span class="stepper"><button data-step="-1" aria-label="减少${label}">−</button><input type="number" aria-label="${label}" data-setting="${key}" min="${setting.min}" max="${setting.max}" step="${setting.step}"><button data-step="1" aria-label="增加${label}">＋</button></span>`;
    return `<span class="el-input"><input data-setting="${key}" aria-label="${label}" ${setting.readOnly ? 'readonly' : ''}></span>`;
  }
  function formItem(setting) {
    return `<div class="form-item" title="${escape(setting.tip)}"><label class="label"><span class="txt">${escape(setting.label)}</span></label><div class="control">${control(setting)}</div></div>`;
  }
  function buildSettings() {
    $('#prefCollapse').innerHTML = groups.map(([key, label]) => `<section class="el-collapse-item open" data-key="${key}" id="pref-${key}">
      <button class="el-collapse-item__header" aria-expanded="true"><span class="el-collapse-item__title">${label}</span><span class="el-collapse-item__arrow">${icon('caret-d')}</span></button>
      <div class="el-collapse-item__wrap"><div class="el-collapse-item__content"><div class="el-form">${state.settings.filter(s => s.group === key).map(formItem).join('')}</div>${['trad','bg'].includes(key) ? '<p class="timeout-hint">对局超时按整局累计，正常对局达到时限也会重启。默认关闭；此项全账号共用，保存后下次启动脚本生效。</p>' : ''}</div></div></div></section>`).join('');
    $('#prefNav').innerHTML = groups.map(([key, label], i) => `<button class="el-segmented__item${i === 0 ? ' is-active' : ''}" data-pref="${key}">${label}</button>`).join('');
    $('#optsMenu').innerHTML = button('启动 Battle.net', 'battleNet') + '<div class="opt-sep"></div>' + state.settings.filter(s => s.group === 'options').map(s => `<div class="opt-row"><span class="opt-lbl">${escape(s.label)}</span>${control(s)}</div>`).join('');
    $('#vipControls').innerHTML = state.settings.filter(s => s.group === 'vip').map(formItem).join('') + '<div class="toolbar">' + button('打开远程网页', 'remotePortal') + button('保存设备名称', 'saveDevice') + '</div>';
    settingsBuilt = true;
  }
  function syncActions(root = document) {
    for (const b of root.querySelectorAll('[data-action]')) if (Object.hasOwn(state.actions, b.dataset.action)) {
      const disabled = !state.actions[b.dataset.action]; if (b.disabled !== disabled) b.disabled = disabled;
    }
  }
  function syncSettings(force = false) {
    const signature = JSON.stringify([state.settings,state.accountChoices,state.accountChoice,state.actions]);
    if (!force && signature === settingsSignature) return;
    settingsSignature = signature;
    for (const setting of state.settings) {
      for (const input of $$(`[data-setting="${setting.key}"]`)) {
        input.disabled = !setting.enabled;
        input.title = setting.tip || (!setting.enabled ? '当前账号配置或卡密权限不支持此选项' : '');
        if (setting.type === 'switch') {
          input.classList.toggle('on', !!setting.value); input.setAttribute('aria-checked', String(!!setting.value));
        } else if (document.activeElement !== input) {
          if (input.tagName === 'SELECT' && JSON.stringify([...input.options].map(o => o.text)) !== JSON.stringify(setting.options))
            input.innerHTML = setting.options.map((s, i) => `<option value="${i}">${escape(s)}</option>`).join('');
          if (input.value !== String(setting.value)) input.value = setting.value;
        }
        input.closest('.stepper')?.querySelectorAll('button').forEach(b => b.disabled = !setting.enabled);
      }
    }
    if (page === 'settings') renderSettingsAccounts();
    syncActions();
  }
  const number = value => Number(value || 0).toLocaleString('zh-CN');
  const percent = (value, maximum) => maximum > 0 ? Math.max(0, Math.min(100, value / maximum * 100)) : 0;
  const restrictionBadge = restricted => `<span class="restriction-badge"${restricted ? '' : ' hidden'} aria-label="账号已封禁">禁</span>`;
  function accountChoice(a, glyph, status = '') {
    return `<span class="choice-icon">${icon(glyph)}</span><span class="choice-copy"><b>${escape(a.name || '未命名账号')}${restrictionBadge(a.restricted)}</b><small>${escape(a.nickname || '昵称尚未读取')}</small>${status ? '<small class="choice-status">' + escape(status) + '</small>' : ''}</span>`;
  }
  function renderSettingsAccounts() {
    if (!state.accountChoices) return;
    const list = $('#settingsAccount'), query = $('#settingsSearch').value.trim().toLocaleLowerCase();
    const rows = state.accountChoices.filter(a => `${a.name} ${a.nickname} ${a.region}`.toLocaleLowerCase().includes(query));
    const selected = state.accountChoice || '';
    const all = $('#settingsAll');
    all.classList.toggle('selected', !selected);
    all.setAttribute('aria-current', String(!selected));
    setText('#settingsAccountCount', `${rows.length} / ${state.accountChoices.length}`);
    setText('#settingsScopeTitle', selected ? state.accountChoices.find(a => a.id === selected)?.name || '单账号设置' : '全部账号设置');
    const ids = new Set(rows.map(a => a.id));
    for (const [id, node] of settingsAccountNodes) if (!ids.has(id)) { node.remove(); settingsAccountNodes.delete(id); }
    list.querySelector('.empty-state')?.remove();
    rows.forEach((a, i) => {
      let node = settingsAccountNodes.get(a.id);
      if (!node) { node = document.createElement('button'); node.type = 'button'; node.dataset.selectSettings = a.id; settingsAccountNodes.set(a.id, node); }
      node.className = 'detail-choice' + (selected === a.id ? ' selected' : '') + (a.restricted ? ' is-restricted' : '');
      node.setAttribute('aria-current', String(selected === a.id));
      patchContent(node, accountChoice(a, 'user'));
      if (list.children[i] !== node) list.insertBefore(node, list.children[i] || null);
    });
    if (!rows.length) list.innerHTML = '<p class="empty-state">' + (query ? '没有匹配的账号' : '暂无游戏账号') + '</p>';
  }
  function detailsHtml(account, d, refreshing) {
    if (!account) return `<div class="details-empty">${icon('user')}<h2>还没有游戏账号</h2><p>添加游戏账号后，即可在这里查看等级、资产与任务进度。</p><button class="el-button" data-tab="console">前往账号控制台</button></div>`;
    const premium = state.tier === 'pro', values = Object.fromEntries(d?.items || []);
    const metric = (label, tone, glyph, hint = '') => `<article class="detail-metric tone-${tone}"><div class="metric-label">${icon(glyph)}<span>${escape(label)}</span></div><strong>${escape(values[label] ?? '—')}</strong>${hint ? `<p>${escape(hint)}</p>` : ''}</article>`;
    const bar = (value, maximum, label) => `<div class="detail-progress" role="progressbar" aria-label="${escape(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent(value, maximum).toFixed(1)}"><span style="width:${percent(value, maximum)}%"></span></div>`;
    const hero = `<header class="account-hero${account.restricted ? ' is-restricted' : ''}"><div class="detail-avatar">${icon(premium ? 'crown' : 'user')}</div><div class="account-identity"><div class="detail-eyebrow">账号详情 <span class="membership-mark">${premium ? '高级会员' : '普通会员'}</span></div><h1>${escape(account.nickname || account.name || '未命名账号')}${restrictionBadge(account.restricted)}</h1><p>${escape(account.name || '未命名账号')} <span>· ${escape(account.region || '地区未设置')}</span></p>${account.note ? `<p class="detail-note">${escape(account.note)}</p>` : ''}</div><div class="detail-refresh"><button class="el-button" data-detail="${escape(account.id)}" ${refreshing ? 'disabled' : ''}>${icon('refresh')}${refreshing ? '正在刷新…' : '刷新数据'}</button><span>最后更新 · ${escape(d?.updated || '尚未读取')}</span></div></header>
      <div class="detail-state-line"><span class="account-status status-${account.restricted ? 'error' : account.connected ? 'running' : 'idle'}">${escape(account.restricted ? '账号已封禁' : account.status || '未启动')}</span><span>${account.connected ? '已连接客户端' : '客户端未连接'}${d ? ' · 显示最近保存的数据' : ' · 等待读取账号数据'}</span></div>`;
    if (!d) return hero + `<p class="track-expiry">${escape(state.accountDetails.expiry)}</p><div class="details-empty">${icon('chart')}<h2>暂无账号数据</h2><p>该账号进入炉石主界面后，点击“刷新数据”读取。</p></div>`;
    return hero + `<div class="detail-overview"><section class="detail-section level-section"><div class="detail-section-title">${icon('star')}<h2>${escape(d.track || '通行证')}进度</h2><span>等级上限 ${number(d.levelCap)}</span></div><div class="level-summary"><strong>${number(d.level)}<small>级</small></strong><div><b>预计满级 · ${escape(values['预计满级'])}</b><p>本级经验 ${number(d.currentExperience)} / ${number(d.nextExperience)}</p></div></div><p class="track-expiry">${escape(state.accountDetails.expiry)}</p>${bar(d.currentExperience, d.nextExperience, '本级经验进度')}<div class="progress-caption"><span>满级进度 ${percent(d.totalExperience,d.maximumExperience).toFixed(1)}%</span><b>还差 ${number(Math.max(0,d.maximumExperience-d.totalExperience))} 经验</b></div>${bar(d.totalExperience, d.maximumExperience, '满级经验进度')}<p class="detail-caption">累计经验 ${number(d.totalExperience)} / ${number(d.maximumExperience)}</p></section>
      <section class="detail-section today-section"><div class="detail-section-title">${icon('bolt')}<h2>今日成长</h2><span>${escape(d.activeDate)}</span></div><div class="detail-metrics two">${metric('今日获取经验','green','bolt')}${metric('今日获取金币','gold','coin')}</div><div class="today-footer"><span>昨日经验 <b>${escape(values['昨日经验'])}</b></span><span>本机累计，仅记录正向增量</span></div></section></div>
      <section class="detail-section"><div class="detail-section-title">${icon('coin')}<h2>账号资产</h2></div><div class="detail-metrics four">${metric('金币','gold','coin')}${metric('粉尘','violet','star')}${metric('门票','blue','token')}${metric('卡包','theme','book')}</div></section>
      <section class="detail-section"><div class="detail-section-title">${icon('trophy')}<h2>对战与段位</h2><span>地下竞技场 · ${escape(values['地下竞技场'])}</span></div><div class="detail-metrics three">${metric('标准段位','theme','shield')}${metric('狂野段位','violet','trophy')}${metric('战棋分数','blue','chart')}</div></section>
      <section class="detail-section"><div class="detail-section-title">${icon('clock')}<h2>运行统计</h2><span>日均按截至昨日的 ${number(d.trackedDays)} 个完整登记日计算</span></div><div class="detail-metrics four">${metric('今日脚本时长','blue','clock',d.currentRuntime)}${metric('日均脚本时长','blue','clock')}${metric('累计脚本时长','theme','clock')}${metric('日均经验','green','bolt')}</div></section>
      <section class="detail-section quest-section"><div class="detail-section-title">${icon('task')}<h2>未完成任务</h2><span>更新 · ${escape(d.questsUpdated)}</span></div><div class="detail-quests">${d.tasks.length ? d.tasks.map(q => `<article class="detail-quest"><div class="quest-top"><span class="quest-kind">${escape(({DAILY:'日常',WEEKLY:'周常'})[q.pool] || '任务')}</span><b>${escape(q.name)}</b><span class="quest-reward">${number(q.experience)} XP</span></div><p>${escape(q.description)}</p><div class="quest-progress">${bar(q.progress,q.quota,q.name)}<span>${number(q.progress)} / ${number(q.quota)}</span></div></article>`).join('') : `<p class="detail-caption">${d.questsKnown ? '当前任务已全部完成' : '等待读取任务'}</p>`}</div></section>`;
  }
  function renderDetailsPage() {
    const data = state.accountDetails;
    if (!data) return;
    const query = $('#detailSearch').value.trim().toLocaleLowerCase();
    const listSignature = JSON.stringify([data.accounts,data.selectedId,query]);
    if (listSignature !== detailListSignature) {
      detailListSignature = listSignature;
      const rows = data.accounts.filter(a => `${a.name} ${a.nickname} ${a.region}`.toLocaleLowerCase().includes(query));
      const list = $('#detailAccountList'), ids = new Set(rows.map(a => a.id));
      for (const [id, node] of detailAccountNodes) if (!ids.has(id)) { node.remove(); detailAccountNodes.delete(id); }
      list.querySelector('.empty-state')?.remove();
      let previous = null;
      for (const a of rows) {
        let node = detailAccountNodes.get(a.id);
        if (!node) { node = document.createElement('button'); node.type = 'button'; node.dataset.selectDetails = a.id; detailAccountNodes.set(a.id, node); }
        const selected = a.id === data.selectedId;
        const className = `detail-choice${selected ? ' selected' : ''}${a.restricted ? ' is-restricted' : ''}`;
        if (node.className !== className) node.className = className;
        if (node.getAttribute('aria-current') !== String(selected)) node.setAttribute('aria-current', String(selected));
        patchContent(node, accountChoice(a, 'user', a.restricted ? '账号已封禁' : a.status || '未启动'));
        const next = previous ? previous.nextSibling : list.firstChild;
        if (next !== node) list.insertBefore(node, next);
        previous = node;
      }
      if (!rows.length) list.innerHTML = `<p class="empty-state">${data.accounts.length ? '没有匹配的账号' : '暂无游戏账号'}</p>`;
      setText('#detailAccountCount', `${rows.length} / ${data.accounts.length}`);
    }
    const selected = data.accounts.find(a => a.id === data.selectedId);
    const signature = JSON.stringify([selected,data.detail,data.expiry,data.refreshing,state.tier]);
    if (signature !== detailSignature) {
      const content = $('#detailContent'), changedAccount = content.dataset.accountId !== (selected?.id || '');
      detailSignature = signature;
      patchContent(content, detailsHtml(selected,data.detail,data.refreshing));
      if (changedAccount) { content.dataset.accountId = selected?.id || ''; content.scrollTop = 0; }
    }
  }
  function cellHtml(row, column) {
    const c = row.values[column.key], key = escape(column.key), id = escape(row.id);
    const common = `data-id="${id}" data-column="${key}" aria-label="${escape(column.label)}"`;
    if (c.type === 'check') return `<input type="checkbox" ${common} ${c.value ? 'checked' : ''} ${c.readOnly ? 'disabled' : ''}>`;
    if (c.type === 'button') {
      const label = String(c.value || column.label);
      const toggle = column.key === 'ScriptToggle' || column.key === 'ClientToggle';
      const start = toggle && /^开(脚本|炉石)$/.test(label), stop = toggle && /^关(脚本|炉石)$/.test(label);
      const tone = stop ? 'stop' : start ? column.key === 'ScriptToggle' ? 'start' : 'client' : 'neutral';
      return `<button class="el-button row-button action-${tone}" ${common}>${start || stop ? icon(start ? 'play' : 'power') : ''}${escape(label)}</button>`;
    }
    if (column.key === 'ScheduleRange') {
      const times = String(c.value).split(/[—|]/).map(v => v.trim());
      return `<span class="schedule-range"><input type="time" step="1" ${common} data-time="start" value="${escape(times[0])}" ${c.readOnly ? 'disabled' : ''}><span>—</span><input type="time" step="1" ${common} data-time="end" value="${escape(times[1])}" ${c.readOnly ? 'disabled' : ''}></span>`;
    }
    if (column.key === 'AccountResources') {
      return `<span class="resource-values">${String(c.value).split('/').map((v,i) => `${i ? '<i>/</i>' : ''}<span class="resource-${['level','gold','dust','tickets'][i] || 'level'}">${escape(v)}</span>`).join('')}</span>`;
    }
    if (column.key === 'AccountRanks') {
      return `<span class="rank-values">${String(c.value).split(' / ').map((v,i) => {
        const tone = [['传说','legend'],['钻石','diamond'],['铂金','platinum'],['黄金','gold'],['白银','silver'],['青铜','bronze'],['学徒','apprentice']].find(([name]) => v.includes(name))?.[1] || 'unknown';
        return `${i ? '<i>/</i>' : ''}<span class="rank-chip rank-${tone}">${escape(v)}</span>`;
      }).join('')}</span>`;
    }
    if (c.type === 'select' && !c.readOnly) {
      if (column.key === 'ConstructedDeck') return `<span class="deck-combo"><input class="cell-input deck-input" ${common} value="${escape(c.value)}" role="combobox" aria-controls="deckMenu" aria-expanded="false" aria-autocomplete="list"><button type="button" class="deck-toggle" data-deck-open="${id}" aria-label="选择卡组">${icon('caret-d')}</button></span>`;
      return `<select class="native-select cell-select" ${common}>${c.choices.map(v => `<option ${v === c.value ? 'selected' : ''}>${escape(v)}</option>`).join('')}</select>`;
    }
    let value = !c.readOnly ? `<input class="cell-input" ${common} value="${escape(c.editValue ?? c.value)}" title="${escape(c.value)}">` : `<span>${escape(c.value)}</span>`;
    if (column.key === 'Account') value = `<div class="cell account-name"><button class="account-detail-link" data-open-details="${id}" title="查看账号详情" aria-label="查看账号详情">${icon('user')}</button>${c.readOnly ? `<span>${escape(c.editValue ?? c.value)}</span>` : value}${restrictionBadge(row.restricted)}<button class="row-menu-btn" data-row-menu="${id}" aria-label="账号更多操作">⋮</button></div>`;
    if (column.key === 'RuntimeStatus') {
      const text = String(c.value || '');
      const tone = /失败|异常|封禁|受限|失效/.test(text) ? 'error' : /等待|排队|恢复|重启|限制|未绑定/.test(text) ? 'waiting'
        : /脚本已停/.test(text) ? 'info' : /停止|未启动|未运行|离线|已暂停/.test(text) ? 'idle'
        : /对局|运行|战斗|招募|匹配|脚本|已启动/.test(text) ? 'running' : 'info';
      value = `<span class="account-status status-${tone}">${escape(text)}</span>`;
    }
    return value;
  }
  // Keep existing DOM nodes, selection, scroll position and CSS animation state.
  // Only changed text/attributes are written; all input HTML is escaped above.
  function patchContent(target, html) {
    const template = document.createElement('template'); template.innerHTML = html;
    function patch(parent, source) {
      const desired = [...source.childNodes];
      desired.forEach((next, i) => {
        const current = parent.childNodes[i];
        if (!current) { parent.append(next.cloneNode(true)); return; }
        if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) { current.replaceWith(next.cloneNode(true)); return; }
        if (current.nodeType === Node.TEXT_NODE) { if (current.data !== next.data) current.data = next.data; return; }
        for (const a of [...current.attributes]) if (!next.hasAttribute(a.name)) current.removeAttribute(a.name);
        for (const a of next.attributes) if (current.getAttribute(a.name) !== a.value) current.setAttribute(a.name, a.value);
        patch(current, next);
        if (current instanceof HTMLInputElement) {
          if (current.type === 'checkbox') current.checked = next.checked;
          else if (current.value !== next.value) current.value = next.value;
        } else if (current instanceof HTMLSelectElement && current.value !== next.value) current.value = next.value;
      });
      while (parent.childNodes.length > desired.length) parent.lastChild.remove();
    }
    patch(target, template.content);
  }
  function renderAccounts() {
    if (!state.grid) return;
    const signature = JSON.stringify(state.grid);
    if (signature === lastGrid) return;
    lastGrid = signature;
    const grid = state.grid;
    const body = $('#accountRows'), columns = JSON.stringify(grid.columns);
    if (columns !== columnSignature) {
      columnSignature = columns; accountNodes.clear(); body.replaceChildren();
      $('#page-console thead').innerHTML = `<tr>${grid.columns.map(c => `<th data-grid-column="${escape(c.key)}">${c.key === 'Selected' ? '<input id="checkAll" type="checkbox" aria-label="全选账号">' : c.key === 'ScheduleRange' ? '<button class="sort-schedule"></button>' : escape(c.label)}<span class="column-resizer" data-resize-column="${escape(c.key)}" role="separator" aria-orientation="vertical" aria-label="调整${escape(c.label)}列宽" aria-valuemin="42" aria-valuemax="800" tabindex="0" title="拖动调整列宽；双击恢复默认"></span></th>`).join('')}</tr>`;
      $('#page-console colgroup')?.remove();
      $('#page-console table').insertAdjacentHTML('afterbegin', `<colgroup>${grid.columns.map(c => `<col data-column-key="${escape(c.key)}">`).join('')}</colgroup>`);
      sizeColumns();
    }
    const sort = grid.scheduleSort, sortButton = $('.sort-schedule');
    sortButton.textContent = sort === 'Ascending' ? '启停时间 ↑ 升序' : sort === 'Descending' ? '启停时间 ↓ 降序' : '启停时间 ↕';
    sortButton.classList.toggle('sorted', sort === 'Ascending' || sort === 'Descending');
    sortButton.title = sort === 'Ascending' ? '当前升序，点击切换降序' : '点击按启停时间升序排列';
    sortButton.closest('th').setAttribute('aria-sort', sort === 'Ascending' ? 'ascending' : sort === 'Descending' ? 'descending' : 'none');
    const ids = new Set(grid.rows.map(r => r.id));
    for (const [id, node] of accountNodes) if (!ids.has(id)) { node.row.remove(); accountNodes.delete(id); }
    if (grid.rows.length) body.querySelector(':scope > .empty-row')?.remove();
    else if (!body.firstChild) body.innerHTML = `<tr class="empty-row"><td colspan="${grid.columns.length}" class="empty-state">还没有游戏账号，点击下方“添加游戏账号”或“导入 token”。</td></tr>`;
    let previous = null;
    for (const row of grid.rows) {
      let node = accountNodes.get(row.id);
      if (!node) {
        const tr = document.createElement('tr');
        tr.dataset.row = row.id;
        node = {row:tr, cells:new Map()}; accountNodes.set(row.id, node);
        for (const c of grid.columns) { const td = document.createElement('td'); td.dataset.gridColumn = c.key; tr.append(td); node.cells.set(c.key, {td, signature:''}); }
      }
      for (const c of grid.columns) {
        const cell = node.cells.get(c.key), cellState = JSON.stringify([row.values[c.key],c.key === 'Account' && row.restricted]);
        const editing = cell.td.contains(document.activeElement) && document.activeElement.matches('input:not([type=checkbox]),select');
        if (cell.signature !== cellState && !editing) {
          patchContent(cell.td, cellHtml(row, c)); cell.td.title = row.values[c.key].tip || ''; cell.signature = cellState;
        }
      }
      const restricted = !!row.restricted;
      node.row.classList.toggle('one-game-pending', !!row.oneGameStop);
      if (node.row.classList.contains('is-restricted') !== restricted) node.row.classList.toggle('is-restricted', restricted);
      // A restriction can arrive while the editable name has focus. Keep the
      // draft intact but update its color and badge immediately.
      const badge = node.row.querySelector('.restriction-badge');
      if (badge && badge.hidden === restricted) badge.hidden = !restricted;
      // Reorder only if needed; moving unchanged rows also restarts CSS animations.
      const next = previous ? previous.nextSibling : body.firstChild;
      if (next !== node.row) body.insertBefore(node.row, next);
      previous = node.row;
    }
    const count = grid.rows.filter(r => r.values.Selected?.value === true).length;
    $('#checkAll').checked = grid.rows.length > 0 && count === grid.rows.length;
    $('#checkAll').indeterminate = count > 0 && count < grid.rows.length;
    $('#batchActions').classList.toggle('show', count > 0);
    setText('#selCount', count);
    $('#accountRows').classList.toggle('busy', !grid.enabled);
    setText('#consoleAccountCount', `共 ${grid.rows.length} 个账号`);
  }
  function table(data) {
    if (!data.rows.length) return '<div class="empty-state">当前账号与日期范围暂无战绩</div>';
    return `<table class="el-table"><thead><tr>${data.columns.map(c => `<th>${escape(c)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(row => `<tr>${row.map(value => `<td>${escape(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  function renderStats() {
    const s = state.stats;
    if (!s) return;
    const query = $('#statsSearch').value.trim().toLocaleLowerCase();
    const listSignature = JSON.stringify([s.accounts,s.selectedId,query]);
    if (listSignature !== statsListSignature) {
      statsListSignature = listSignature;
      const rows = s.accounts.filter(a => `${a.name} ${a.nickname} ${a.region}`.toLocaleLowerCase().includes(query));
      const list = $('#statsAccountList'), ids = new Set(rows.map(a => a.id));
      for (const [id,node] of statsAccountNodes) if (!ids.has(id)) { node.remove(); statsAccountNodes.delete(id); }
      list.querySelector('.details-empty')?.remove();
      rows.forEach((a,i) => {
        let node = statsAccountNodes.get(a.id);
        if (!node) { node = document.createElement('button'); node.type = 'button'; node.dataset.selectStats = a.id; statsAccountNodes.set(a.id,node); }
        node.className = 'detail-choice' + (a.id === s.selectedId ? ' is-selected' : '') + (a.restricted ? ' is-restricted' : '');
        node.setAttribute('aria-pressed', String(a.id === s.selectedId));
        patchContent(node, accountChoice(a, 'chart'));
        if (list.children[i] !== node) list.insertBefore(node,list.children[i] || null);
      });
      if (!rows.length) list.innerHTML = '<div class="details-empty"><p>' + (s.accounts.length ? '没有匹配的账号' : '暂无游戏账号') + '</p></div>';
      setText('#statsAccountCount', `${rows.length} / ${s.accounts.length}`);
    }
    const signature = JSON.stringify(s);
    if (signature === lastStats) return;
    lastStats = signature;
    const account = s.accounts.find(a => a.id === s.selectedId), content = $('#statsContent');
    if (content.dataset.accountId !== s.selectedId) { content.dataset.accountId = s.selectedId; content.scrollTop = 0; }
    $('#statsHero').classList.toggle('is-restricted', !!account?.restricted);
    patchContent($('#statsHero'), `<div class="detail-avatar">${icon('chart')}</div><div class="account-identity"><div class="detail-eyebrow">战绩统计 <span class="membership-mark">${state.tier === 'pro' ? '高级会员' : '普通会员'}</span></div><h1>${escape(account?.nickname || account?.name || '暂无游戏账号')}${restrictionBadge(account?.restricted)}</h1><p>${account ? escape(account.name + ' · ' + account.region) : '添加账号后，即可查看对局表现与历史记录'}</p></div><div class="stats-hero-note">每一场对局，皆有迹可循<span>胜负 · 排名 · 卡组表现</span></div>`);
    for (const [selector,value] of [['#historyFrom',s.from],['#historyTo',s.to]]) {
      const input = $(selector); if (input !== document.activeElement && input.value !== value) input.value = value;
    }
    setText('#historyRangeHint', s.hint);
    patchContent($('#historyModes'), [['Constructed','传统对战'],['Battlegrounds','酒馆战棋'],['Arena','竞技场']].map(([mode,label]) => `<button class="el-button${s.mode === mode ? ' el-button--primary' : ''}" aria-pressed="${s.mode === mode}" data-history-mode="${mode}">${label}</button>`).join(''));
    $('#historyArenaLabel').hidden = s.mode !== 'Arena';
    const arena = $('#historyArena');
    if (JSON.stringify([...arena.options].map(o => o.text)) !== JSON.stringify(s.variants)) arena.innerHTML = s.variants.map((v,i) => `<option value="${i}">${escape(v)}</option>`).join('');
    if (arena !== document.activeElement) arena.value = String(s.arena);
    patchContent($('#historySummary'), s.summary.map(([title,value,hint],i) => `<div class="stat-card"><div class="s-icon">${icon(['chart','trophy','bolt','shield','star'][i % 5])}</div><div class="s-meta"><div class="s-title">${escape(title)}</div><div class="s-value">${escape(value)}</div><div class="s-sub">${escape(hint)}</div></div></div>`).join(''));
    patchContent($('#historyTables'), `${s.mode === 'Constructed' ? `<section class="s-col"><h2 class="section-title"><span class="bar"></span>${escape(s.breakdownTitle)}</h2><div class="table-card">${table(s.breakdown)}</div></section>` : ''}<section class="s-col"><h2 class="section-title"><span class="bar"></span>全部${s.mode === 'Arena' ? '轮次' : '对局'}记录</h2><div class="table-card">${table(s.recent)}</div></section>`);
    syncActions($('#page-stats'));
  }
  function renderLicense() {
    const signature = JSON.stringify([state.tier,state.license]);
    if (signature === licenseSignature) return;
    licenseSignature = signature;
    const l = state.license;
    setText('#vip-tier-tag', state.tier === 'pro' ? '高级会员' : '标准会员');
    $('#vip-tier-tag').className = 'el-tag ' + (state.tier === 'pro' ? 'el-tag--warning' : 'el-tag--primary');
    setText('#licenseOnline', l.online); setText('#licenseHeadline', l.remaining);
    setText('#licenseKey', l.key); setText('#licenseStatus', l.status); setText('#licenseExpiry', l.expiry);
    setText('#licenseRemaining', l.remaining); setText('#licenseChecked', l.checkedAt);
    setText('#quota', l.quota); setText('#remoteStatus', l.remote);
  }
  function renderVersion() {
    setText('.v-num', '当前版本 v' + state.version);
    if (!state.notes) return;
    setText('#versionUpdateStatus', state.updateStatus);
    if (versionNotes === state.notes) return;
    versionNotes = state.notes;
    const versions = [...state.notes.matchAll(/(v\d+\.\d+\.\d+)\s*([\s\S]*?)(?=v\d+\.\d+\.\d+|$)/g)].slice(0, 5);
    $('#changelog').innerHTML = `<div class="section-title"><span class="bar"></span>近期版本更新内容</div><div class="table-card"><table class="el-table"><tbody>${versions.map(v => `<tr><td><span class="el-tag el-tag--info">${escape(v[1])}</span></td><td>${escape(v[2].trim()).replace(/\n/g, '<br>')}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function receive(next) {
    state = next;
    if (!document.body.classList.contains('tier-' + state.tier)) {
      document.body.classList.remove('tier-pro', 'tier-standard'); document.body.classList.add('tier-' + state.tier);
    }
    if (!document.body.classList.contains('ready')) document.body.classList.add('ready');
    $('#loading')?.remove();
    if (!settingsBuilt) buildSettings();
    syncSettings(); renderLicense();
    if (page === 'console') renderAccounts();
    if (page === 'details') renderDetailsPage();
    if (page === 'stats') renderStats();
    if (page === 'version') renderVersion();
    if (page === 'console' && logOpen) {
      const lines = $('#logLines'), text = (state.log || []).join('\n');
      if (lines.textContent !== text) {
        const atEnd = lines.scrollHeight - lines.scrollTop - lines.clientHeight < 40;
        lines.textContent = text; if (atEnd) lines.scrollTop = lines.scrollHeight;
      }
    }
    setText('#runtimeStatus', state.status.join('　'));
    setText('#footerLicense', state.license.remaining);
    setText('#footerVersion', 'HSD AI v' + state.version);
    setText('#consoleQuota', state.license.quota); setText('#consoleConcurrency', state.concurrency);
    if ($('#consoleConcurrency').title !== state.concurrencyTip) $('#consoleConcurrency').title = state.concurrencyTip;
  }
  function closeMenus() {
    $$('.tools-menu.show,.context-menu.show').forEach(e => e.classList.remove('show'));
    $$('[aria-controls=deckMenu][aria-expanded=true]').forEach(e => e.setAttribute('aria-expanded','false'));
  }
  function openMenu(menu, anchor) {
    const already = menu.classList.contains('show'); closeMenus(); if (already) return;
    menu.classList.add('show');
    const r = anchor.getBoundingClientRect(), h = Math.min(menu.scrollHeight, innerHeight - 20);
    menu.style.left = Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, r.right - menu.offsetWidth)) + 'px';
    menu.style.top = Math.max(8, r.top >= h + 8 ? r.top - h - 6 : Math.min(r.bottom + 6, innerHeight - h - 8)) + 'px';
  }
  async function switchPage(tab) {
    if (tab === page) return;
    closeMenus();
    if (logOpen && (page === 'console' || tab === 'console')) await request('window', {action:'log', open:tab === 'console'});
    page = tab;
    $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
    $$('#mainTabs [data-tab]').forEach(t => { t.classList.toggle('is-active', t.dataset.tab === page); t.setAttribute('aria-selected', String(t.dataset.tab === page)); });
    document.body.classList.toggle('on-console', page === 'console');
    await request('page', { page });
  }
  function updateSetting(input) {
    const s = state.settings.find(s => s.key === input.dataset.setting);
    if (!s) return;
    const value = s.type === 'switch' ? !s.value : ['number','select'].includes(s.type) ? Number(input.value) : input.value;
    if (s.type === 'number' && (!Number.isFinite(value) || value < s.min || value > s.max)) { toast(`请输入 ${s.min}～${s.max} 范围内的数值`, true); input.value = s.value; return; }
    fire('setting', {key:s.key, value});
  }
  function renderDeckMenu(id) {
    const cell = state.grid?.rows.find(row => row.id === id)?.values.ConstructedDeck;
    if (!cell || cell.readOnly) { closeMenus(); return; }
    $('#deckMenu').innerHTML = cell.choices.length ? cell.choices.map(choice => `<button type="button" class="el-button" role="option" aria-selected="${choice === cell.value}" data-deck-choice="${escape(choice)}">${escape(choice)}</button>`).join('') : '<div class="empty-decks">暂未读取到卡组，请先启动本账号炉石并等待主界面加载完成；也可双击输入框，直接输入完整卡组名称。</div>';
    accountNodes.get(id)?.row.querySelector('.deck-input')?.setAttribute('aria-expanded', 'true');
  }
  async function openDeckMenu(id, anchor) {
    const cell = state.grid?.rows.find(row => row.id === id)?.values.ConstructedDeck;
    if (!cell || cell.readOnly) return;
    const menu = $('#deckMenu');
    if (menu.classList.contains('show') && menu.dataset.accountId === id) { closeMenus(); return; }
    closeMenus();
    const opening = {};
    menu.opening = opening;
    menu.dataset.accountId = id;
    menu.innerHTML = '<div class="empty-decks" role="status">正在加载本账号卡组…</div>';
    openMenu(menu, anchor);
    anchor.closest('.deck-combo').querySelector('input').setAttribute('aria-expanded', 'true');
    try {
      await request('refreshDecks', {id});
      if (menu.opening === opening && menu.classList.contains('show') && page === 'console') renderDeckMenu(id);
    } catch (_) {
      if (menu.opening === opening && menu.classList.contains('show')) renderDeckMenu(id);
    }
  }
  function showRowMenu(row, x, y) {
    const menu = $('#rowMenu');
    closeMenus();
    const id = row.dataset.row, rows = state?.grid?.rows || [];
    const index = rows.findIndex(a => a.id === id);
    if (index < 0 || !state.grid.enabled) return;
    menu.dataset.accountId = id;
    menu.querySelector('[data-action=oneGame]').textContent = rows[index].oneGameStop ? '取消打完一局停止' : '本账号打完一局停止';
    const focus = menu.querySelector('[data-action=focus]');
    focus.disabled = true;
    request('canFocusAccount', {id}).then(available => {
      if (menu.classList.contains('show') && menu.dataset.accountId === id) focus.disabled = !available;
    }).catch(() => {});
    menu.querySelector('[data-action=top]').disabled = menu.querySelector('[data-action=up]').disabled = index === 0;
    menu.querySelector('[data-action=down]').disabled = index === rows.length - 1;
    menu.classList.add('show');
    menu.style.left = Math.max(6, Math.min(x, innerWidth - menu.offsetWidth - 6)) + 'px';
    menu.style.top = Math.max(6, Math.min(y, innerHeight - menu.offsetHeight - 6)) + 'px';
  }
  document.addEventListener('contextmenu', e => {
    const row = e.target.closest('#accountRows tr[data-row]');
    if (row) { e.preventDefault(); showRowMenu(row, e.clientX, e.clientY); }
  });
  document.addEventListener('click', async e => {
    try {
      const t = e.target.closest('button,[data-tab]');
      if (e.target.closest('.column-resizer')) return;
      if (t?.disabled) return;
      if (t?.dataset.sidebar) { const name = t.dataset.sidebar; layout.collapsed[name] = layout.collapsed[name] !== true; applySidebar(name); saveLayout(); return; }
      if (t?.id === 'switchLegacyUi') return await request('legacyUi');
      if (t?.dataset.tab) return await switchPage(t.dataset.tab);
      if (t?.classList.contains('sort-schedule')) return await request('sortSchedule');
      if (t?.dataset.setting) return updateSetting(t);
      if (t?.dataset.step) { const input = t.parentElement.querySelector('input'); Number(t.dataset.step) > 0 ? input.stepUp() : input.stepDown(); return updateSetting(input); }
      if (t?.dataset.deckOpen) return openDeckMenu(t.dataset.deckOpen, t);
      if (t?.hasAttribute('data-deck-choice')) {
        const id = $('#deckMenu').dataset.accountId, value = t.dataset.deckChoice;
        closeMenus(); return await request('account', {id,column:'ConstructedDeck',value});
      }
      if (t?.dataset.openDetails) {
        await request('selectDetails', {id:t.dataset.openDetails});
        return await switchPage('details');
      }
      if (t?.dataset.selectDetails) return await request('selectDetails', {id:t.dataset.selectDetails});
      if (t?.hasAttribute('data-select-settings')) return await request('settingsAccount', {id:t.dataset.selectSettings});
      if (t?.dataset.selectStats) return await request('stats', {accountId:t.dataset.selectStats});
      if (t?.dataset.detail) return await request('details', {id:t.dataset.detail});
      if (t?.dataset.column) return await request('account', {id:t.dataset.id, column:t.dataset.column});
      if (t?.dataset.historyMode) return await request('stats', {mode:t.dataset.historyMode});
      if (t?.dataset.pref) {
        const section = $('#pref-' + t.dataset.pref); section.classList.add('open');
        section.querySelector('.el-collapse-item__header').setAttribute('aria-expanded', 'true');
        section.scrollIntoView({behavior:'smooth', block:'start'});
        $$('#prefNav button').forEach(b => b.classList.toggle('is-active', b === t)); return;
      }
      if (t?.matches('.el-collapse-item__header')) { const open = t.parentElement.classList.toggle('open'); t.setAttribute('aria-expanded', String(open)); return; }
      if (t?.id === 'toolsBtn' || t?.id === 'optsBtn') return openMenu($(t.id === 'toolsBtn' ? '#toolsMenu' : '#optsMenu'), t);
      if (t?.dataset.rowMenu) {
        const box = t.getBoundingClientRect();
        return showRowMenu(t.closest('tr'), box.left, box.bottom);
      }
      if (t?.dataset.action) {
        closeMenus();
        await request('action', {action:t.dataset.action, accountId:t.closest('#rowMenu')?.dataset.accountId || ''});
        if (t.dataset.action === 'save') toast('已提交保存，请查看操作结果。');
        return;
      }
      if (!e.target.closest('.tools-menu')) closeMenus();
    } catch (_) { /* request reports the actionable message */ }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'checkAll') { fire('selection', {selected:t.checked}); return; }
    if (t.dataset.column) {
      const value = t.dataset.time ? [...t.parentElement.querySelectorAll('input')].map(i => i.value).join('|') : t.type === 'checkbox' ? t.checked : t.value;
      fire('account', {id:t.dataset.id,column:t.dataset.column,value}); return;
    }
    if (t.dataset.setting) return updateSetting(t);
    const statsKey = {historyFrom:'from',historyTo:'to',historyArena:'arena'}[t.id];
    if (statsKey) fire('stats', {[statsKey]:t.type === 'date' ? t.value : Number(t.value)});
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenus();
    if (e.key === 'ArrowDown' && e.target.matches('.deck-input')) { e.preventDefault(); openDeckMenu(e.target.dataset.id, e.target.nextElementSibling); }
    if (e.target.matches('[data-select-details],[data-select-stats],[data-select-settings]') && ['ArrowDown','ArrowUp','Home','End'].includes(e.key)) {
      e.preventDefault();
      const choices = e.target.hasAttribute('data-select-settings') ? [...document.querySelectorAll('#page-settings [data-select-settings]')] : [...e.target.parentElement.querySelectorAll('button')];
      const current = choices.indexOf(e.target);
      const index = e.key === 'Home' ? 0 : e.key === 'End' ? choices.length - 1 : Math.max(0,Math.min(choices.length - 1,current + (e.key === 'ArrowDown' ? 1 : -1)));
      choices[index]?.focus(); choices[index]?.click();
    }
  });
  $('#detailSearch').addEventListener('input', () => { if (state) renderDetailsPage(); });
  $('#settingsSearch').addEventListener('input', () => { if (state) renderSettingsAccounts(); });
  $('#statsSearch').addEventListener('input', () => { if (state) renderStats(); });
  document.addEventListener('dblclick', e => { if (e.target.matches('.deck-input')) e.target.select(); });
  // A snapshot may arrive while an editor is focused. Apply that cached snapshot
  // on blur even if the controller has no further changes to publish.
  document.addEventListener('focusout', () => setTimeout(() => {
    if (!state) return;
    syncSettings(true);
    if (page === 'console') { lastGrid = ''; renderAccounts(); }
    if (page === 'stats') { lastStats = ''; renderStats(); }
  }, 0));
  window.addEventListener('resize', closeMenus);

  document.addEventListener('pointerdown', e => {
    const handle = e.target.closest('.column-resizer');
    if (!handle || e.button !== 0) return;
    e.preventDefault();
    const key = handle.dataset.resizeColumn, startX = e.clientX, startWidth = columnWidth(key);
    handle.setPointerCapture(e.pointerId); document.body.classList.add('resizing-column');
    const move = event => { layout.widths[key] = Math.max(42, Math.min(800, Math.round(startWidth + event.clientX - startX))); sizeColumns(); };
    const stop = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('lostpointercapture', stop); document.body.classList.remove('resizing-column'); saveLayout(); };
    handle.addEventListener('pointermove', move); handle.addEventListener('lostpointercapture', stop);
  });
  document.addEventListener('dblclick', e => { const handle = e.target.closest('.column-resizer'); if (handle) { delete layout.widths[handle.dataset.resizeColumn]; sizeColumns(); saveLayout(); } });
  document.addEventListener('keydown', e => {
    const handle = e.target.closest('.column-resizer');
    if (!handle || !['ArrowLeft','ArrowRight','Home'].includes(e.key)) return;
    e.preventDefault(); const key = handle.dataset.resizeColumn;
    if (e.key === 'Home') delete layout.widths[key];
    else layout.widths[key] = Math.max(42, Math.min(800, columnWidth(key) + (e.key === 'ArrowRight' ? 10 : -10)));
    sizeColumns(); saveLayout();
  });
  for (const name of ['details','stats','settings']) {
    const root = $('#page-' + name), sidebar = root.querySelector('aside'); sidebar.id = name + '-sidebar';
    root.insertAdjacentHTML('afterbegin', `<div class="workspace-toolbar"><button type="button" class="sidebar-toggle" data-sidebar="${name}" aria-controls="${sidebar.id}"></button></div>`);
    applySidebar(name);
  }

  // Extend the supplied design with a dedicated account detail workspace.
  $('#toolsMenu').innerHTML = [['邮箱密码批量登录','email'],['导出所有账号信息','export'],['设置多时段','schedule'],['切换列排序','columns'],['安装 / 更新炉石插件','installPlugin'],['刷新客户端状态','refreshStatus']].map(([label, action]) => button(label,action)).join('');
  $('#page-console').insertAdjacentHTML('afterbegin', '<div class="console-meta"><span id="consoleAccountCount"></span><span id="consoleQuota"></span><span id="consoleConcurrency"></span></div>');
  const batchButtons = $$('#batchActions button'); batchButtons[0].dataset.action = 'startSelected'; batchButtons[1].dataset.action = 'stopSelected';
  document.body.insertAdjacentHTML('beforeend', `<div class="context-menu tools-menu" id="rowMenu">${[['本账号打完一局停止','oneGame'],['聚焦炉石','focus'],['设置多时段','schedule'],['置顶','top'],['上移','up'],['下移','down'],['封禁账号置顶','restrictedTop'],['封禁账号置底','restrictedBottom'],['删除本账号','rowDelete']].map(([l,a]) => button(l,a)).join('')}</div>`);
  document.body.insertAdjacentHTML('beforeend', '<div class="tools-menu deck-menu" id="deckMenu" role="listbox" aria-label="可用卡组"></div>');
  const vip = $('#page-vip');
  vip.querySelector('.toolbar').innerHTML = '<span class="lbl"><b>卡密信息</b></span><span class="el-tag" id="vip-tier-tag"></span><span class="el-tag el-tag--info" id="licenseOnline"></span><span class="spacer"></span><span id="licenseHeadline"></span>';
  vip.querySelector('.table-card').innerHTML = `<div class="license-data"><span class="license-key" id="licenseKey"></span>${button('复制卡密','copyLicense')}<span id="licenseStatus"></span><span id="licenseExpiry"></span><span id="licenseRemaining"></span><span id="licenseChecked"></span></div><div class="toolbar license-buttons">${button('刷新卡密状态','refreshLicense')}${button('更换卡密','changeLicense')}${button('续费卡密','renew')}${button('退出登录','logout')}</div>`;
  vip.querySelector('.page-body > .toolbar').outerHTML = '<div class="section-title"><span class="bar"></span>授权功能</div><div class="el-form" id="vipControls"></div><div class="form-note" id="remoteStatus"></div>';
  const note = vip.querySelector('.page-body > .form-note');
  note.innerHTML = '<b>版本差异说明：</b>实际可用模式、AI 策略、并发和传说额度以当前卡密的服务端授权为准。升级及续费请联系群主。<br><b id="quota"></b>';
  $$('#page-vip .plan-item').forEach(item => { if (/多设备并发|多设备多开/.test(item.textContent)) item.innerHTML = '<span class="ck"></span>' + (item.textContent.includes('并发') ? '授权设备名额' : '多开进程扩展'); });
  $('.version-hero .v-desc').textContent = '多账号自动登录 · 定时运行 · 网页远程管理';
  $('.version-hero .toolbar').innerHTML = button('检查更新','checkUpdates',true) + button('教程文档','tutorial') + '<span class="form-note" id="versionUpdateStatus"></span>';
  $('.status-bar').innerHTML = '<span id="runtimeStatus"></span><span class="spacer"></span><span id="footerLicense"></span><span id="footerVersion" class="ver"></span>';
  const logHead = $('#logHead');
  logHead.querySelector('.el-tag').remove();
  logHead.addEventListener('click', async () => {
    logHead.style.pointerEvents = 'none';
    try {
      logOpen = !logOpen;
      if (!logOpen) $('#logPanel').classList.add('collapsed');
      await request('window',{action:'log',open:logOpen});
      $('#logPanel').classList.toggle('collapsed',!logOpen);
    } finally { logHead.style.pointerEvents = ''; }
  });
  $$('.wc-btn').forEach((b,i) => b.onclick = () => fire('window',{action:['minimize','maximize','close'][i]}));
  $('.app-header').addEventListener('dblclick', e => { if (!e.target.closest('button,[data-tab]')) fire('window',{action:'maximize'}); });
  $$('#mainTabs [data-tab]').forEach(t => { t.tabIndex = 0; t.setAttribute('role','tab'); t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchPage(t.dataset.tab).catch(() => {}); } }); });
  bai.onState = receive;
  bai.request('ready').catch(e => { $('#loading').textContent = e.message; });
})();
