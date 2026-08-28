(function () {
  'use strict';

  // ---------- 常量 ----------
  const STORAGE_TASKS = 'tasktrack.tasks.v1';
  const STORAGE_DAILY = 'tasktrack.daily.v1';
  const STORAGE_EVENTS = 'tasktrack.events.v1';
  const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
  const EMOJIS = [
    '📌', '📝', '✅', '⚠️', '🎯', '💡', '⭐', '❤️',
    '🔔', '✏️', '🎉', '📞', '💼', '🏠', '🍽️', '🚗',
    '✈️', '📚', '🏋️', '💊', '🛒', '🧹', '👶', '🐶',
    '🌱', '💰', '🎂', '📷', '🎵', '🏖️', '☕', '🎁'
  ];

  const CHECK_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  // 读取日历单元格（收起态）固定行高（与 CSS --cal-cell-h 保持一致，运行时读取以适配移动端）
  function cellH() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--cal-cell-h').trim();
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 132;
  }

  // ---------- 状态 ----------
  let state = {
    tasks: [],      // 每周任务 { id, title, weekday(1-7), done, createdAt }
    dailyTasks: [], // 每日任务 { id, title, done, createdAt }
    dailyDate: '',  // 每日任务最近一次“重置”的日期 YYYY-MM-DD
    events: {}      // 日历 { 'YYYY-MM-DD': [{ id, icon, text }] }
  };

  function load() {
    try {
      const t = localStorage.getItem(STORAGE_TASKS);
      if (t) state.tasks = JSON.parse(t);

      const d = localStorage.getItem(STORAGE_DAILY);
      if (d) {
        const o = JSON.parse(d);
        state.dailyTasks = o.tasks || [];
        state.dailyDate = o.date || '';
      }

      const e = localStorage.getItem(STORAGE_EVENTS);
      if (e) state.events = JSON.parse(e);
    } catch (err) {
      console.warn('读取本地数据失败', err);
    }
  }
  function saveTasks() {
    try { localStorage.setItem(STORAGE_TASKS, JSON.stringify(state.tasks)); } catch (e) {}
  }
  function saveDaily() {
    try { localStorage.setItem(STORAGE_DAILY, JSON.stringify({ date: state.dailyDate, tasks: state.dailyTasks })); } catch (e) {}
  }
  function saveEvents() {
    try { localStorage.setItem(STORAGE_EVENTS, JSON.stringify(state.events)); } catch (e) {}
  }

  // ---------- 工具 ----------
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function toKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function parseKey(key) {
    const p = key.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  // 周一=1 ... 周日=7
  function monIndex(d) { return (d.getDay() + 6) % 7 + 1; }

  // ---------- DOM ----------
  const $ = function (s, r) { return (r || document).querySelector(s); };
  const $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  const navItems = $$('.nav-item');
  const views = {
    weekly: $('#view-weekly'),
    daily: $('#view-daily'),
    calendar: $('#view-calendar')
  };

  // 每周任务
  const addTaskInput = $('#add-task-input');
  const addTaskDay = $('#add-task-day');
  const addTaskBtn = $('#add-task-btn');
  const weeklyLists = $('#weekly-lists');
  const weeklyEmpty = $('#weekly-empty');

  // 每日任务
  const addDailyInput = $('#add-daily-input');
  const addDailyBtn = $('#add-daily-btn');
  const dailyList = $('#daily-list');
  const dailyEmpty = $('#daily-empty');

  // 日历
  const monthTitle = $('#month-title');
  const prevMonthBtn = $('#prev-month');
  const nextMonthBtn = $('#next-month');
  const todayBtn = $('#today-btn');
  const calendarGrid = $('#calendar-grid');

  // 日期编辑弹层
  const dayOverlay = $('#day-modal-overlay');
  const modal = $('#day-modal');
  const modalTitle = $('#day-modal-title');
  const modalEvents = $('#day-modal-events');
  const addEventBtn = $('#add-event-btn');
  const clearAllBtn = $('#clear-all-btn');
  const confirmBtn = $('#confirm-btn');
  const closeBtn = $('#day-modal-close');

  // 任务列表弹层
  const tasklistOverlay = $('#tasklist-overlay');
  const tasklistModal = $('#tasklist-modal');
  const tasklistTitle = $('#tasklist-title');
  const tasklistBody = $('#tasklist-body');
  const tasklistClose = $('#tasklist-close');

  const iconPopover = $('#icon-popover');
  const toast = $('#toast');

  // ---------- 提示 ----------
  let toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2200);
  }

  // ---------- 侧边栏切换 ----------
  navItems.forEach(function (item) {
    item.addEventListener('click', function () {
      navItems.forEach(function (n) { n.classList.remove('active'); });
      item.classList.add('active');
      const view = item.dataset.view;
      Object.keys(views).forEach(function (k) {
        views[k].classList.toggle('active', k === view);
      });
    });
  });

  // ---------- 每周任务模块 ----------
  function renderWeekly() {
    weeklyLists.innerHTML = '';
    const todayWeekday = monIndex(new Date());
    let anyVisible = false;

    for (let w = 1; w <= 7; w++) {
      // 仅显示未完成任务（完成任务后从列表隐藏）
      const tasks = state.tasks.filter(function (t) { return t.weekday === w && !t.done; });
      if (tasks.length === 0) continue; // 无任务的周日期列表直接隐藏

      anyVisible = true;
      tasks.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });

      const section = document.createElement('section');
      section.className = 'day-list';
      const isToday = w === todayWeekday;
      section.innerHTML =
        '<header class="day-list-header">' +
          '<h3 class="day-list-title">' + WEEKDAYS[w - 1] +
            (isToday ? ' <span class="today-badge">今天</span>' : '') +
          '</h3>' +
          '<span class="day-list-count">' + tasks.length + ' 项</span>' +
        '</header>' +
        '<div class="task-list">' + tasks.map(taskHTML).join('') + '</div>';

      weeklyLists.appendChild(section);
    }

    weeklyEmpty.hidden = anyVisible;

    $$('.task', weeklyLists).forEach(function (el) {
      const id = el.dataset.id;
      el.querySelector('.task-check').addEventListener('click', function () { toggleTask(id); });
      el.querySelector('.task-delete').addEventListener('click', function () { deleteTask(id); });
    });
  }

  function taskHTML(t) {
    return '<div class="task' + (t.done ? ' done' : '') + '" data-id="' + t.id + '">' +
      '<button class="task-check" title="标记完成">' + CHECK_SVG + '</button>' +
      '<span class="task-title">' + escapeHtml(t.title) + '</span>' +
      '<button class="task-delete" title="删除">✕</button>' +
    '</div>';
  }

  function addTask() {
    const title = addTaskInput.value.trim();
    if (!title) {
      showToast('请输入任务内容');
      addTaskInput.focus();
      return;
    }
    const weekday = Number(addTaskDay.value);
    state.tasks.push({ id: uid(), title: title, weekday: weekday, done: false, createdAt: Date.now() });
    saveTasks();
    renderWeekly();
    addTaskInput.value = '';
    showToast('已添加到' + WEEKDAYS[weekday - 1]);
  }

  function toggleTask(id) {
    const t = state.tasks.find(function (x) { return x.id === id; });
    if (!t) return;
    t.done = !t.done;
    saveTasks();
    renderWeekly();
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter(function (x) { return x.id !== id; });
    saveTasks();
    renderWeekly();
    showToast('任务已删除');
  }

  addTaskBtn.addEventListener('click', addTask);
  addTaskInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') addTask();
  });

  // ---------- 每日任务模块 ----------
  function ensureDailyReset() {
    const today = toKey(new Date());
    if (state.dailyDate !== today) {
      state.dailyTasks.forEach(function (t) { t.done = false; });
      state.dailyDate = today;
      saveDaily();
    }
  }

  function renderDaily() {
    ensureDailyReset();
    dailyList.innerHTML = '';

    const undone = state.dailyTasks.filter(function (t) { return !t.done; });
    if (undone.length === 0) {
      dailyEmpty.hidden = false;
      return;
    }
    dailyEmpty.hidden = true;

    undone.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });

    const card = document.createElement('section');
    card.className = 'day-list';
    card.innerHTML =
      '<header class="day-list-header">' +
        '<h3 class="day-list-title">今日任务</h3>' +
        '<span class="day-list-count">' + undone.length + ' 项</span>' +
      '</header>' +
      '<div class="task-list">' + undone.map(taskHTML).join('') + '</div>';
    dailyList.appendChild(card);

    $$('.task', dailyList).forEach(function (el) {
      const id = el.dataset.id;
      el.querySelector('.task-check').addEventListener('click', function () { toggleDailyTask(id); });
      el.querySelector('.task-delete').addEventListener('click', function () { deleteDailyTask(id); });
    });
  }

  function addDailyTask() {
    const title = addDailyInput.value.trim();
    if (!title) {
      showToast('请输入任务内容');
      addDailyInput.focus();
      return;
    }
    state.dailyTasks.push({ id: uid(), title: title, done: false, createdAt: Date.now() });
    saveDaily();
    renderDaily();
    addDailyInput.value = '';
    showToast('已添加每日任务');
  }

  function toggleDailyTask(id) {
    const t = state.dailyTasks.find(function (x) { return x.id === id; });
    if (!t) return;
    t.done = !t.done;
    saveDaily();
    renderDaily();
  }

  function deleteDailyTask(id) {
    state.dailyTasks = state.dailyTasks.filter(function (x) { return x.id !== id; });
    saveDaily();
    renderDaily();
    showToast('任务已删除');
  }

  addDailyBtn.addEventListener('click', addDailyTask);
  addDailyInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') addDailyTask();
  });

  // ---------- 查看任务列表模块 ----------
  let currentTaskListMode = null;

  const tasklistBtns = $$('.btn-tasklist');
  tasklistBtns.forEach(function (b) {
    b.addEventListener('click', function () { openTaskList(b.dataset.list); });
  });

  function openTaskList(mode) {
    currentTaskListMode = mode;
    tasklistTitle.textContent = mode === 'weekly' ? '每周任务列表' : '每日任务列表';
    if (mode === 'weekly') renderWeeklyTaskList();
    else renderDailyTaskList();

    tasklistOverlay.classList.add('open');
    tasklistModal.style.transition = 'none';
    tasklistModal.style.transform = 'scale(0.94) translateY(10px)';
    void tasklistModal.offsetHeight;
    tasklistModal.style.transition = '';
    tasklistModal.style.transform = 'none';
  }

  function closeTaskList() {
    tasklistModal.style.transform = 'scale(0.94) translateY(10px)';
    tasklistOverlay.classList.remove('open');
    setTimeout(function () {
      tasklistModal.style.transform = '';
      currentTaskListMode = null;
    }, 320);
  }

  function renderWeeklyTaskList() {
    tasklistBody.innerHTML = '';
    const undone = state.tasks.filter(function (t) { return !t.done; });
    const done = state.tasks.filter(function (t) { return t.done; });
    tasklistBody.appendChild(buildTaskListSection('未完成', undone, true));
    tasklistBody.appendChild(buildTaskListSection('已完成', done, true));
  }

  function renderDailyTaskList() {
    tasklistBody.innerHTML = '';
    const undone = state.dailyTasks.filter(function (t) { return !t.done; });
    const done = state.dailyTasks.filter(function (t) { return t.done; });
    tasklistBody.appendChild(buildTaskListSection('未完成', undone, false));
    tasklistBody.appendChild(buildTaskListSection('已完成', done, false));
  }

  function buildTaskListSection(title, tasks, groupByWeekday) {
    const sec = document.createElement('div');
    sec.className = 'tasklist-section';

    const h = document.createElement('div');
    h.className = 'tasklist-section-title';
    h.textContent = title + '（' + tasks.length + '）';
    sec.appendChild(h);

    if (tasks.length === 0) {
      const e = document.createElement('div');
      e.className = 'tasklist-section-empty';
      e.textContent = '暂无' + title + '任务';
      sec.appendChild(e);
      return sec;
    }

    tasks.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });

    if (groupByWeekday) {
      for (let w = 1; w <= 7; w++) {
        const wt = tasks.filter(function (t) { return t.weekday === w; });
        if (wt.length === 0) continue;
        const group = document.createElement('div');
        group.className = 'tasklist-week';
        const wh = document.createElement('div');
        wh.className = 'tasklist-week-title';
        wh.textContent = WEEKDAYS[w - 1];
        group.appendChild(wh);
        wt.forEach(function (t) { group.appendChild(tasklistRow(t)); });
        sec.appendChild(group);
      }
    } else {
      tasks.forEach(function (t) { sec.appendChild(tasklistRow(t)); });
    }

    return sec;
  }

  function tasklistRow(t) {
    const row = document.createElement('div');
    row.className = 'tasklist-row' + (t.done ? ' done' : '');
    row.innerHTML = '<span class="tasklist-row-title">' + escapeHtml(t.title) + '</span>';
    return row;
  }

  tasklistClose.addEventListener('click', closeTaskList);
  tasklistOverlay.addEventListener('click', function (e) {
    if (e.target === tasklistOverlay) closeTaskList();
  });

  // ---------- 日历模块 ----------
  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();

  let selectedCell = null;
  let expandedCell = null;
  let singleTimer = null;

  const mobileQuery = window.matchMedia('(max-width: 768px)');
  function isMobile() { return mobileQuery.matches; }
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  function renderCalendar() {
    calendarGrid.innerHTML = '';
    const first = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7; // 周一=0
    const total = Math.ceil((offset + lastDay) / 7) * 7;

    const todayKey = toKey(new Date());

    for (let i = 0; i < total; i++) {
      const dayNum = i - offset + 1;
      const date = new Date(viewYear, viewMonth, dayNum);
      const key = toKey(date);
      const inMonth = dayNum >= 1 && dayNum <= lastDay;

      const cell = document.createElement('div');
      cell.className = 'day-cell';
      if (!inMonth) cell.classList.add('dim');
      if (key === todayKey) cell.classList.add('today');
      cell.dataset.key = key;

      const num = document.createElement('div');
      num.className = 'day-number';
      num.textContent = date.getDate();
      cell.appendChild(num);

      const body = document.createElement('div');
      body.className = 'day-body';
      const events = state.events[key] || [];
      if (events.length) {
        const list = document.createElement('div');
        list.className = 'day-events';
        events.forEach(function (ev) {
          const chip = document.createElement('div');
          chip.className = 'event-chip';
          chip.innerHTML = '<span class="chip-icon">' + escapeHtml(ev.icon) + '</span>' +
            '<span class="chip-text">' + escapeHtml(ev.text) + '</span>';
          list.appendChild(chip);
        });
        body.appendChild(list);
      }
      cell.appendChild(body);

      if (events.length > 3) {
        const more = document.createElement('div');
        more.className = 'more-hint';
        more.textContent = '+' + (events.length - 3) + ' 更多';
        cell.appendChild(more);
      }

      if (inMonth) bindCell(cell, key);
      calendarGrid.appendChild(cell);
    }

    monthTitle.textContent = viewYear + '年' + (viewMonth + 1) + '月';
  }

  function bindCell(cell, key) {
    if (isTouchDevice) {
      // 触屏设备：原生 dblclick 不可靠，手动识别“双击”打开编辑器
      let lastTap = 0;
      cell.addEventListener('click', function () {
        const now = Date.now();
        if (now - lastTap < 350) {
          lastTap = 0;
          if (singleTimer) { clearTimeout(singleTimer); singleTimer = null; }
          openEditor(key, cell);
          return;
        }
        lastTap = now;
        if (singleTimer) clearTimeout(singleTimer);
        singleTimer = setTimeout(function () {
          singleTimer = null;
          handleCellSingleClick(cell);
        }, 350);
      });
    } else {
      cell.addEventListener('click', function () {
        if (singleTimer) clearTimeout(singleTimer);
        singleTimer = setTimeout(function () {
          singleTimer = null;
          handleCellSingleClick(cell);
        }, 230);
      });
      cell.addEventListener('dblclick', function () {
        if (singleTimer) { clearTimeout(singleTimer); singleTimer = null; }
        openEditor(key, cell);
      });
    }
  }

  function handleCellSingleClick(cell) {
    // 移动端：去掉“展开/收回”需求，单击仅做选中特效
    if (isMobile()) {
      if (selectedCell && selectedCell !== cell) selectedCell.classList.remove('selected');
      selectedCell = cell;
      cell.classList.add('selected');
      return;
    }

    const wasExpanded = cell === expandedCell;

    if (expandedCell && expandedCell !== cell) {
      const other = expandedCell;
      expandedCell = null;
      collapseCell(other);
    }
    if (selectedCell && selectedCell !== cell) {
      selectedCell.classList.remove('selected');
      selectedCell = null;
    }

    if (wasExpanded) {
      expandedCell = null;
      collapseCell(cell);
    } else {
      selectedCell = cell;
      expandedCell = cell;
      cell.classList.add('selected');
      expandCell(cell);
    }
  }

  function expandCell(cell) {
    cell.classList.add('expanded');
    const full = cell.scrollHeight + 4;
    const start = cell.getBoundingClientRect().height;
    cell.style.height = start + 'px';
    void cell.offsetHeight; // 强制回流
    cell.style.height = full + 'px';
  }

  function collapseCell(cell) {
    const cur = cell.getBoundingClientRect().height;
    cell.style.height = cur + 'px';
    void cell.offsetHeight;
    cell.style.height = cellH() + 'px';
    cell.classList.remove('expanded');
    clearTimeout(cell._collapseTimer);
    cell._collapseTimer = setTimeout(function () {
      if (!cell.classList.contains('expanded')) cell.style.height = '';
    }, 420);
  }

  prevMonthBtn.addEventListener('click', function () {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    resetCalendarSelection();
    renderCalendar();
  });
  nextMonthBtn.addEventListener('click', function () {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    resetCalendarSelection();
    renderCalendar();
  });
  todayBtn.addEventListener('click', function () {
    const n = new Date();
    viewYear = n.getFullYear();
    viewMonth = n.getMonth();
    resetCalendarSelection();
    renderCalendar();
  });

  function resetCalendarSelection() {
    selectedCell = null;
    expandedCell = null;
  }

  // 跨断点（桌面/手机切换）时重绘日历，清空展开/选中状态
  mobileQuery.addEventListener('change', function () { renderCalendar(); });

  // ---------- 日期编辑弹层 ----------
  let currentEditorDate = null;
  let tempEvents = [];
  let activeIconIndex = null;

  function findCellByKey(key) {
    return calendarGrid.querySelector('.day-cell[data-key="' + key + '"]');
  }

  function openEditor(dateKey, cell) {
    if (dayOverlay.classList.contains('open')) return;
    currentEditorDate = dateKey;
    tempEvents = (state.events[dateKey] || []).map(function (e) { return { id: e.id, icon: e.icon, text: e.text }; });
    renderModalTitle(dateKey);
    renderEditorEvents();

    const cellRect = cell.getBoundingClientRect();

    dayOverlay.classList.add('open');
    modal.style.transition = 'none';
    modal.style.transform = '';
    void modal.offsetHeight;

    const modalRect = modal.getBoundingClientRect();
    const sx = cellRect.width / modalRect.width;
    const sy = cellRect.height / modalRect.height;
    const dx = (cellRect.left + cellRect.width / 2) - (modalRect.left + modalRect.width / 2);
    const dy = (cellRect.top + cellRect.height / 2) - (modalRect.top + modalRect.height / 2);

    modal.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(' + sx + ', ' + sy + ')';
    void modal.offsetHeight;
    modal.style.transition = '';
    modal.style.transform = 'none';
  }

  function closeEditor(commit) {
    const cell = findCellByKey(currentEditorDate);
    const cellRect = cell ? cell.getBoundingClientRect() : null;

    if (commit) {
      const cleaned = tempEvents.filter(function (e) { return e.text.trim() !== ''; });
      if (cleaned.length === 0) {
        delete state.events[currentEditorDate];
      } else {
        state.events[currentEditorDate] = cleaned;
      }
      saveEvents();
      renderCalendar();
    }

    const modalRect = modal.getBoundingClientRect();
    let target;
    if (cellRect && cellRect.width > 0) {
      const sx = cellRect.width / modalRect.width;
      const sy = cellRect.height / modalRect.height;
      const dx = (cellRect.left + cellRect.width / 2) - (modalRect.left + modalRect.width / 2);
      const dy = (cellRect.top + cellRect.height / 2) - (modalRect.top + modalRect.height / 2);
      target = 'translate(' + dx + 'px, ' + dy + 'px) scale(' + sx + ', ' + sy + ')';
    } else {
      target = 'translate(0px, 26px) scale(0.92)';
    }

    dayOverlay.classList.remove('open');
    modal.style.transform = target;

    setTimeout(function () {
      modal.style.transition = 'none';
      modal.style.transform = '';
      void modal.offsetHeight;
      modal.style.transition = '';
      currentEditorDate = null;
      tempEvents = [];
    }, 470);
  }

  function renderModalTitle(dateKey) {
    const d = parseKey(dateKey);
    modalTitle.textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
      WEEKDAYS[monIndex(d) - 1];
  }

  function renderEditorEvents() {
    modalEvents.innerHTML = '';
    tempEvents.forEach(function (ev, i) {
      const row = document.createElement('div');
      row.className = 'editor-event';
      row.innerHTML =
        '<button class="icon-btn" data-i="' + i + '" title="选择图标">' + escapeHtml(ev.icon) + '</button>' +
        '<input class="event-text" type="text" placeholder="输入要做的事情…" maxlength="60" value="' + escapeHtml(ev.text) + '" data-i="' + i + '" />' +
        '<button class="remove-event-btn" data-i="' + i + '" title="删除">✕</button>';
      modalEvents.appendChild(row);
    });

    $$('.icon-btn', modalEvents).forEach(function (b) {
      b.addEventListener('click', function () { openIconPicker(b, Number(b.dataset.i)); });
    });
    $$('.event-text', modalEvents).forEach(function (inp) {
      inp.addEventListener('input', function () {
        const i = Number(inp.dataset.i);
        if (tempEvents[i]) tempEvents[i].text = inp.value;
      });
    });
    $$('.remove-event-btn', modalEvents).forEach(function (b) {
      b.addEventListener('click', function () {
        tempEvents.splice(Number(b.dataset.i), 1);
        renderEditorEvents();
      });
    });
  }

  addEventBtn.addEventListener('click', function () {
    tempEvents.push({ id: uid(), icon: '📌', text: '' });
    renderEditorEvents();
    const inputs = $$('.event-text', modalEvents);
    const last = inputs[inputs.length - 1];
    if (last) last.focus();
  });

  clearAllBtn.addEventListener('click', function () {
    tempEvents = [];
    state.events[currentEditorDate] = [];
    saveEvents();
    renderEditorEvents();
    resetCalendarSelection();
    renderCalendar();
    showToast('已清空该日的所有事项');
  });

  confirmBtn.addEventListener('click', function () { closeEditor(true); });
  closeBtn.addEventListener('click', function () { closeEditor(false); });

  // ---------- 图标选择 ----------
  function openIconPicker(btn, index) {
    activeIconIndex = index;

    iconPopover.innerHTML = '';
    EMOJIS.forEach(function (em) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'icon-option';
      b.textContent = em;
      b.addEventListener('click', function () {
        if (tempEvents[activeIconIndex]) tempEvents[activeIconIndex].icon = em;
        const btnEl = $$('.icon-btn', modalEvents)[activeIconIndex];
        if (btnEl) btnEl.textContent = em;
        closeIconPicker();
      });
      iconPopover.appendChild(b);
    });

    iconPopover.classList.add('open');

    const rect = btn.getBoundingClientRect();
    const pw = iconPopover.offsetWidth;
    const ph = iconPopover.offsetHeight;
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (top + ph > window.innerHeight - 8) top = rect.top - ph - 6;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    iconPopover.style.left = left + 'px';
    iconPopover.style.top = top + 'px';
  }

  function closeIconPicker() {
    iconPopover.classList.remove('open');
    activeIconIndex = null;
  }

  document.addEventListener('click', function (e) {
    if (iconPopover.classList.contains('open')) {
      if (!iconPopover.contains(e.target) && !e.target.closest('.icon-btn')) {
        closeIconPicker();
      }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (iconPopover.classList.contains('open')) { closeIconPicker(); return; }
    if (dayOverlay.classList.contains('open')) { closeEditor(false); return; }
    if (tasklistOverlay.classList.contains('open')) { closeTaskList(); }
  });

  // ---------- 跨天自动重置每日任务 ----------
  setInterval(function () {
    const today = toKey(new Date());
    if (state.dailyDate !== today) {
      ensureDailyReset();
      renderDaily();
      if (currentTaskListMode === 'daily') renderDailyTaskList();
    }
  }, 30000);

  // ---------- 初始化 ----------
  load();
  ensureDailyReset();
  renderWeekly();
  renderDaily();
  renderCalendar();
})();
