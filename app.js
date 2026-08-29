(function () {
  'use strict';

  // ---------- 常量 ----------
  const STORAGE_TASKS = 'tasktrack.tasks.v1';
  const STORAGE_DAILY = 'tasktrack.daily.v1';
  const STORAGE_EVENTS = 'tasktrack.events.v1';
  const STORAGE_TODO = 'tasktrack.todo.v1';
  const STORAGE_PRODUCTS = 'tasktrack.products.v1';
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
    events: {},     // 日历 { 'YYYY-MM-DD': [{ id, icon, text }] }
    todoTasks: [],  // 待办清单 { id, title, done, createdAt }
    products: []    // 选品集合 { id, name, xianyu, xhs, tmall, douyin, price, charts: { exposure:[], views:[], clicks:[], sales:[], afterSales:[] } }
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

      const td = localStorage.getItem(STORAGE_TODO);
      if (td) state.todoTasks = JSON.parse(td);

      const pr = localStorage.getItem(STORAGE_PRODUCTS);
      if (pr) state.products = normalizeProducts(JSON.parse(pr));
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
  function saveTodo() {
    try { localStorage.setItem(STORAGE_TODO, JSON.stringify(state.todoTasks)); } catch (e) {}
  }
  function saveProducts() {
    try { localStorage.setItem(STORAGE_PRODUCTS, JSON.stringify(state.products)); } catch (e) {}
  }

  // 确保每个选品都具备 5 张数据图字段（兼容旧数据 / 手动构造）
  function emptyCharts() {
    return { exposure: [], views: [], clicks: [], sales: [], afterSales: [] };
  }
  function normalizeProducts(list) {
    if (!Array.isArray(list)) return [];
    return list.map(function (p) {
      const base = { id: '', name: '', xianyu: '', xhs: '', tmall: '', douyin: '', price: '' };
      Object.assign(base, p);
      base.charts = Object.assign(emptyCharts(), p.charts || {});
      return base;
    });
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
    todo: $('#view-todo'),
    products: $('#view-products'),
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

  // 待办清单
  const addTodoInput = $('#add-todo-input');
  const addTodoBtn = $('#add-todo-btn');
  const todoList = $('#todo-list');
  const todoEmpty = $('#todo-empty');

  // 选品集合
  const addProductBtn = $('#add-product-btn');
  const productsList = $('#products-list');
  const productsEmpty = $('#products-empty');

  // 数据图
  const chartsOverlay = $('#charts-overlay');
  const chartsModal = $('#charts-modal');
  const chartsTitle = $('#charts-title');
  const chartsBody = $('#charts-body');
  const chartsClose = $('#charts-close');

  const chartViewer = $('#chart-viewer');
  const chartViewerInner = $('#chart-viewer-inner');

  const confirmOverlay = $('#confirm-overlay');
  const confirmMessage = $('#confirm-message');
  const confirmOk = $('#confirm-ok');
  const confirmCancel = $('#confirm-cancel');

  const pointOverlay = $('#point-overlay');
  const pointTitle = $('#point-title');
  const pointDate = $('#point-date');
  const pointValue = $('#point-value');
  const pointDelete = $('#point-delete');
  const pointCancel = $('#point-cancel');
  const pointSave = $('#point-save');
  const pointClose = $('#point-close');

  const zoomMenu = $('#zoom-menu');
  const chartTooltip = $('#chart-tooltip');

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

  // ---------- 任务完成动画 ----------
  // 字体变淡 + 删除线从左到右 + 整个任务块逐渐消失
  const COMPLETE_ANIM_MS = 460;
  function animateTaskCompletion(taskEl, onDone) {
    if (!taskEl || taskEl.classList.contains('completing')) return;
    // 锁定实际高度作为收起起点；临时关闭过渡，避免从默认 max-height 跳变
    taskEl.style.transition = 'none';
    taskEl.style.maxHeight = taskEl.scrollHeight + 'px';
    void taskEl.offsetHeight; // 强制回流，提交起始高度
    taskEl.style.transition = '';
    taskEl.classList.add('completing');
    setTimeout(function () {
      taskEl.classList.remove('completing');
      taskEl.style.maxHeight = '';
      if (onDone) onDone();
    }, COMPLETE_ANIM_MS);
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
      el.querySelector('.task-check').addEventListener('click', function () {
        animateTaskCompletion(el, function () { completeTask(id); });
      });
      el.querySelector('.task-delete').addEventListener('click', function () { deleteTask(id); });
    });
  }

  function taskHTML(t) {
    return '<div class="task' + (t.done ? ' done' : '') + '" data-id="' + t.id + '">' +
      '<button class="task-check" title="标记完成">' + CHECK_SVG + '</button>' +
      '<span class="task-title"><span class="task-title-text">' + escapeHtml(t.title) + '</span></span>' +
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

  function completeTask(id) {
    const t = state.tasks.find(function (x) { return x.id === id; });
    if (!t) return;
    t.done = true;
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
      el.querySelector('.task-check').addEventListener('click', function () {
        animateTaskCompletion(el, function () { completeDailyTask(id); });
      });
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

  function completeDailyTask(id) {
    const t = state.dailyTasks.find(function (x) { return x.id === id; });
    if (!t) return;
    t.done = true;
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

  // ---------- 待办清单模块 ----------
  function renderTodo() {
    todoList.innerHTML = '';

    const undone = state.todoTasks.filter(function (t) { return !t.done; });
    if (undone.length === 0) {
      todoEmpty.hidden = false;
      return;
    }
    todoEmpty.hidden = true;

    undone.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });

    const card = document.createElement('section');
    card.className = 'day-list';
    card.innerHTML =
      '<header class="day-list-header">' +
        '<h3 class="day-list-title">待办清单</h3>' +
        '<span class="day-list-count">' + undone.length + ' 项</span>' +
      '</header>' +
      '<div class="task-list">' + undone.map(taskHTML).join('') + '</div>';
    todoList.appendChild(card);

    $$('.task', todoList).forEach(function (el) {
      const id = el.dataset.id;
      el.querySelector('.task-check').addEventListener('click', function () {
        animateTaskCompletion(el, function () { completeTodoTask(id); });
      });
      el.querySelector('.task-delete').addEventListener('click', function () { deleteTodoTask(id); });
    });
  }

  function addTodoTask() {
    const title = addTodoInput.value.trim();
    if (!title) {
      showToast('请输入待办内容');
      addTodoInput.focus();
      return;
    }
    state.todoTasks.push({ id: uid(), title: title, done: false, createdAt: Date.now() });
    saveTodo();
    renderTodo();
    addTodoInput.value = '';
    showToast('已添加待办');
  }

  function completeTodoTask(id) {
    const t = state.todoTasks.find(function (x) { return x.id === id; });
    if (!t) return;
    t.done = true;
    saveTodo();
    renderTodo();
  }

  function deleteTodoTask(id) {
    state.todoTasks = state.todoTasks.filter(function (x) { return x.id !== id; });
    saveTodo();
    renderTodo();
    showToast('待办已删除');
  }

  addTodoBtn.addEventListener('click', addTodoTask);
  addTodoInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') addTodoTask();
  });

  // ---------- 选品集合模块 ----------
  const CHART_METRICS = [
    { key: 'exposure', label: '曝光量' },
    { key: 'views', label: '浏览量' },
    { key: 'clicks', label: '点击量' },
    { key: 'sales', label: '成交量' },
    { key: 'afterSales', label: '售后量' }
  ];
  const PRODUCT_FIELDS = [
    { key: 'xianyu', label: '闲鱼搜索指数', badge: '闲', badgeClass: 'badge-xianyu' },
    { key: 'xhs', label: '小红书相关笔记热度', badge: '红', badgeClass: 'badge-xhs' },
    { key: 'tmall', label: '天猫相关评论区热度', badge: '猫', badgeClass: 'badge-tmall' },
    { key: 'douyin', label: '抖音商城相关评论区热度', badge: '抖', badgeClass: 'badge-douyin' },
    { key: 'price', label: '进货价', badge: '', badgeClass: '' }
  ];

  function getProduct(id) {
    return state.products.find(function (p) { return p.id === id; }) || null;
  }

  function renderProducts() {
    productsList.innerHTML = '';
    productsEmpty.hidden = state.products.length > 0;
    state.products.forEach(function (p) { productsList.appendChild(buildProductCard(p)); });
  }

  function buildProductCard(p) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.id = p.id;

    let fieldsHtml = '';
    PRODUCT_FIELDS.forEach(function (f) {
      const badgeHtml = f.badge ? '<span class="badge ' + f.badgeClass + '">' + f.badge + '</span>' : '';
      fieldsHtml +=
        '<div class="product-field">' +
          badgeHtml +
          '<span class="field-label">' + f.label + '</span>' +
          '<input class="field-input" type="number" step="any" data-field="' + f.key + '" value="' + escapeHtml(String(p[f.key] || '')) + '" />' +
        '</div>';
    });

    card.innerHTML =
      '<div class="product-header">' +
        '<input class="product-name" type="text" placeholder="输入选品名称…" maxlength="60" value="' + escapeHtml(p.name || '') + '" />' +
        '<button class="product-delete" title="删除选品">✕</button>' +
      '</div>' +
      '<div class="product-fields">' + fieldsHtml + '</div>' +
      '<button class="product-charts-btn" title="打开数据图">' +
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18" /><path d="m7 14 4-4 3 3 5-6" /></svg>' +
        '数据图' +
      '</button>';

    card.querySelector('.product-name').addEventListener('input', function (e) {
      updateProductField(p.id, 'name', e.target.value);
    });
    card.querySelector('.product-delete').addEventListener('click', function () { deleteProduct(p.id); });
    card.querySelector('.product-charts-btn').addEventListener('click', function () { openCharts(p.id); });
    $$('.field-input', card).forEach(function (inp) {
      inp.addEventListener('input', function () { updateProductField(p.id, inp.dataset.field, inp.value); });
    });

    return card;
  }

  function addProduct() {
    state.products.push({
      id: uid(), name: '',
      xianyu: '', xhs: '', tmall: '', douyin: '', price: '',
      charts: emptyCharts()
    });
    saveProducts();
    renderProducts();
  }

  function deleteProduct(id) {
    state.products = state.products.filter(function (x) { return x.id !== id; });
    saveProducts();
    renderProducts();
    showToast('选品已删除');
  }

  function updateProductField(id, key, value) {
    const p = getProduct(id);
    if (!p) return;
    p[key] = value;
    saveProducts();
  }

  addProductBtn.addEventListener('click', addProduct);

  // ---------- 数据图模块 ----------
  let currentChartsProduct = null;
  let pointEditState = null;
  let viewState = null;

  function findPoint(productId, metricKey, pointId) {
    const p = getProduct(productId);
    if (!p) return null;
    const arr = p.charts[metricKey] || [];
    return arr.find(function (x) { return x.id === pointId; }) || null;
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const exp = Math.floor(Math.log10(v));
    const base = Math.pow(10, exp);
    const m = v / base;
    let n;
    if (m <= 1) n = 1;
    else if (m <= 2) n = 2;
    else if (m <= 5) n = 5;
    else n = 10;
    return n * base;
  }

  function fmtNum(v) {
    if (Number.isInteger(v)) return String(v);
    return String(Math.round(v * 100) / 100);
  }

  function fmtDate(key) {
    const parts = String(key).split('-');
    if (parts.length !== 3) return key;
    return parts[0].slice(-2) + '-' + parts[1] + '-' + parts[2];
  }

  function chartSVG(points) {
    const W = 320, H = 200;
    const padL = 42, padR = 12, padT = 14, padB = 26;
    const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    const pw = x1 - x0, ph = y1 - y0;

    const sorted = points.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0);
    });
    const maxValue = sorted.length ? Math.max.apply(null, sorted.map(function (p) { return Number(p.value) || 0; })) : 0;
    const maxV = niceMax(maxValue);

    let s = '';
    const grid = 4;
    for (let i = 0; i <= grid; i++) {
      const val = maxV * i / grid;
      const y = y1 - (val / maxV) * ph;
      s += '<line class="chart-grid" x1="' + x0 + '" y1="' + y + '" x2="' + x1 + '" y2="' + y + '"/>';
      s += '<text class="chart-axis-label" x="' + (x0 - 5) + '" y="' + (y + 3) + '" text-anchor="end">' + fmtNum(val) + '</text>';
    }

    s += '<line class="chart-axis" x1="' + x0 + '" y1="' + y0 + '" x2="' + x0 + '" y2="' + y1 + '"/>';
    s += '<line class="chart-axis" x1="' + x0 + '" y1="' + y1 + '" x2="' + x1 + '" y2="' + y1 + '"/>';

    let minT = null, maxT = null;
    sorted.forEach(function (p) {
      const t = new Date(p.date + 'T00:00:00').getTime();
      if (minT === null || t < minT) minT = t;
      if (maxT === null || t > maxT) maxT = t;
    });

    const pts = sorted.map(function (p) {
      const t = new Date(p.date + 'T00:00:00').getTime();
      let x;
      if (sorted.length === 1 || maxT === minT) x = x0 + pw / 2;
      else x = x0 + (t - minT) / (maxT - minT) * pw;
      const y = y1 - (Math.max(0, Number(p.value) || 0) / maxV) * ph;
      return { p: p, x: x, y: y };
    });

    pts.forEach(function (pt) {
      s += '<text class="chart-axis-label chart-date-label" x="' + pt.x + '" y="' + (y1 + 14) + '" text-anchor="middle">' + fmtDate(pt.p.date) + '</text>';
    });

    if (pts.length >= 2) {
      const coords = pts.map(function (pt) { return pt.x.toFixed(1) + ',' + pt.y.toFixed(1); }).join(' ');
      s += '<polyline class="chart-line" points="' + coords + '"/>';
    }

    pts.forEach(function (pt) {
      s += '<circle class="chart-point" data-id="' + pt.p.id + '" cx="' + pt.x.toFixed(1) + '" cy="' + pt.y.toFixed(1) + '" r="4"/>';
    });

    return '<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' + s + '</svg>';
  }

  function renderCharts(productId) {
    const product = getProduct(productId);
    if (!product) return;
    currentChartsProduct = productId;
    chartsTitle.textContent = '数据图 · ' + (product.name || '未命名选品');
    chartsBody.innerHTML = '';

    CHART_METRICS.forEach(function (m) {
      const card = document.createElement('div');
      card.className = 'chart-card';
      card.dataset.metric = m.key;
      const points = product.charts[m.key] || [];
      card.innerHTML =
        '<div class="chart-card-title">' + m.label + '</div>' +
        '<div class="chart-body">' + chartSVG(points) + '</div>';
      chartsBody.appendChild(card);
      bindChartNormal(card, productId, m.key);
    });
  }

  function bindChartNormal(card, productId, metricKey) {
    const svg = card.querySelector('.chart-svg');
    let singleTimer = null;

    function schedule(fn) {
      if (singleTimer) clearTimeout(singleTimer);
      singleTimer = setTimeout(function () { singleTimer = null; fn(); }, 260);
    }

    svg.addEventListener('click', function (e) {
      if (viewState) return;
      if (e.target.closest('.chart-point')) return;
      schedule(function () { openPointEditor(productId, metricKey, null, { date: toKey(new Date()) }); });
    });

    svg.addEventListener('dblclick', function () {
      if (singleTimer) { clearTimeout(singleTimer); singleTimer = null; }
      requestEnterViewMode(card, productId, metricKey);
    });

    $$('.chart-point', card).forEach(function (c) {
      c.addEventListener('click', function (e) {
        e.stopPropagation();
        if (viewState) return;
        const id = c.dataset.id;
        schedule(function () { openPointEditor(productId, metricKey, id, null); });
      });
      c.addEventListener('mouseenter', function () {
        c.classList.add('hovered');
        const p = findPoint(productId, metricKey, c.dataset.id);
        if (p) {
          chartTooltip.textContent = fmtDate(p.date) + '　' + fmtNum(p.value);
          chartTooltip.classList.add('show');
        }
      });
      c.addEventListener('mousemove', function (e) {
        chartTooltip.style.left = e.clientX + 'px';
        chartTooltip.style.top = e.clientY + 'px';
      });
      c.addEventListener('mouseleave', function () {
        c.classList.remove('hovered');
        chartTooltip.classList.remove('show');
      });
    });
  }

  function openCharts(productId) {
    renderCharts(productId);
    chartsOverlay.classList.add('open');
  }

  function closeCharts() {
    chartsOverlay.classList.remove('open');
    setTimeout(function () { currentChartsProduct = null; }, 320);
  }

  chartsClose.addEventListener('click', closeCharts);
  chartsOverlay.addEventListener('click', function (e) {
    if (e.target === chartsOverlay) closeCharts();
  });

  // ---------- 数据点编辑 ----------
  function openPointEditor(productId, metricKey, pointId, defaults) {
    if (!getProduct(productId)) return;
    pointEditState = { productId: productId, metricKey: metricKey, pointId: pointId };
    const point = pointId ? findPoint(productId, metricKey, pointId) : null;
    const metric = CHART_METRICS.find(function (m) { return m.key === metricKey; });
    pointTitle.textContent = (pointId ? '修改' : '新增') + '数据点 · ' + (metric ? metric.label : '');
    pointDate.value = point ? point.date : (defaults && defaults.date ? defaults.date : toKey(new Date()));
    pointValue.value = point ? point.value : '';
    pointDelete.hidden = !pointId;
    pointOverlay.classList.add('open');
    setTimeout(function () { pointValue.focus(); }, 60);
  }

  function closePointEditor() {
    pointOverlay.classList.remove('open');
    pointEditState = null;
  }

  function savePoint() {
    const st = pointEditState;
    if (!st) return;
    const date = pointDate.value;
    const value = parseFloat(pointValue.value);
    if (!date) { showToast('请选择日期'); return; }
    if (!isFinite(value)) { showToast('请输入有效数值'); return; }
    const product = getProduct(st.productId);
    if (!product) return;
    const arr = product.charts[st.metricKey] || (product.charts[st.metricKey] = []);
    if (st.pointId) {
      const p = arr.find(function (x) { return x.id === st.pointId; });
      if (p) { p.date = date; p.value = value; }
    } else {
      arr.push({ id: uid(), date: date, value: value });
    }
    saveProducts();
    closePointEditor();
    if (currentChartsProduct === st.productId) renderCharts(st.productId);
  }

  function deletePoint() {
    const st = pointEditState;
    if (!st || !st.pointId) return;
    const product = getProduct(st.productId);
    if (!product) return;
    product.charts[st.metricKey] = (product.charts[st.metricKey] || []).filter(function (x) { return x.id !== st.pointId; });
    saveProducts();
    closePointEditor();
    if (currentChartsProduct === st.productId) renderCharts(st.productId);
  }

  pointSave.addEventListener('click', savePoint);
  pointCancel.addEventListener('click', closePointEditor);
  pointClose.addEventListener('click', closePointEditor);
  pointDelete.addEventListener('click', deletePoint);
  pointOverlay.addEventListener('click', function (e) {
    if (e.target === pointOverlay) closePointEditor();
  });
  pointDate.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); savePoint(); }
  });
  pointValue.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); savePoint(); }
  });

  // ---------- 确认弹层 ----------
  let confirmResolve = null;
  function showConfirm(msg) {
    return new Promise(function (resolve) {
      confirmMessage.textContent = msg;
      confirmOverlay.classList.add('open');
      confirmResolve = resolve;
    });
  }
  function resolveConfirm(val) {
    if (!confirmResolve) return;
    const r = confirmResolve;
    confirmResolve = null;
    confirmOverlay.classList.remove('open');
    r(val);
  }
  confirmOk.addEventListener('click', function () { resolveConfirm(true); });
  confirmCancel.addEventListener('click', function () { resolveConfirm(false); });
  confirmOverlay.addEventListener('click', function (e) {
    if (e.target === confirmOverlay) resolveConfirm(false);
  });

  // ---------- 数据图查看模式 ----------
  function requestEnterViewMode(card, productId, metricKey) {
    if (viewState) return;
    showConfirm('是否进入查看模式？').then(function (ok) {
      if (ok) enterViewMode(card, productId, metricKey);
    });
  }

  function requestExitViewMode() {
    if (!viewState) return;
    showConfirm('是否退出查看模式？').then(function (ok) {
      if (ok) exitViewMode();
    });
  }

  function enterViewMode(card, productId, metricKey) {
    if (viewState) return;
    const startRect = card.getBoundingClientRect();
    const startW = card.offsetWidth;

    // 占位保持数据图模块布局不变
    const ph = document.createElement('div');
    ph.className = 'chart-placeholder';
    ph.style.width = card.offsetWidth + 'px';
    ph.style.height = card.offsetHeight + 'px';
    card.parentNode.insertBefore(ph, card);

    chartViewer.classList.add('open');
    chartViewerInner.appendChild(card);
    card.classList.add('viewing');
    card.style.width = startW + 'px';

    const endRect = card.getBoundingClientRect();
    const dx = (startRect.left + startRect.width / 2) - (endRect.left + endRect.width / 2);
    const dy = (startRect.top + startRect.height / 2) - (endRect.top + endRect.height / 2);
    const baseScale = 1.2;

    card.style.transition = 'none';
    card.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1)';
    void card.offsetHeight;
    card.style.transition = '';
    card.style.transform = 'translate(0px,0px) scale(' + baseScale + ')';

    viewState = {
      productId: productId, metricKey: metricKey, card: card,
      contentEl: card.querySelector('.chart-svg'), placeholder: ph,
      baseScale: baseScale, contentScale: 1, panX: 0, panY: 0, zoomDir: 'in', startW: startW
    };

    setTimeout(function () { bindViewInteractions(card); }, 460);
  }

  function exitViewMode() {
    const vs = viewState;
    if (!vs) return;
    const card = vs.card;
    const targetRect = vs.placeholder.getBoundingClientRect();
    const tdx = (targetRect.left + targetRect.width / 2) - window.innerWidth / 2;
    const tdy = (targetRect.top + targetRect.height / 2) - window.innerHeight / 2;

    // 内容复位到自然比例，仅动画数据图盒子
    if (vs.contentEl) vs.contentEl.style.transform = '';

    card.style.transition = 'none';
    card.style.transform = 'translate(0px,0px) scale(' + vs.baseScale + ')';
    void card.offsetHeight;
    card.style.transition = 'transform 0.45s cubic-bezier(0.22, 0.9, 0.32, 1)';
    card.style.transform = 'translate(' + tdx + 'px,' + tdy + 'px) scale(1)';

    chartViewer.classList.remove('open');
    viewState = null;

    setTimeout(function () {
      card.style.transition = '';
      card.style.transform = '';
      vs.placeholder.replaceWith(card);
      card.classList.remove('viewing');
      card.style.width = '';
      renderCharts(currentChartsProduct);
    }, 460);
  }

  function applyContentTransform() {
    if (!viewState || !viewState.contentEl) return;
    viewState.contentEl.style.transform = 'translate(' + viewState.panX + 'px,' + viewState.panY + 'px) scale(' + viewState.contentScale + ')';
  }

  function zoomContent(factor) {
    if (!viewState) return;
    viewState.contentScale *= factor;
    if (viewState.contentScale < 0.2) viewState.contentScale = 0.2;
    if (viewState.contentScale > 8) viewState.contentScale = 8;
    if (viewState.contentScale <= 1) {
      viewState.panX = 0;
      viewState.panY = 0;
    }
    applyContentTransform();
  }

  function bindViewInteractions(card) {
    let dragging = false, moved = false;
    let startX = 0, startY = 0, origPanX = 0, origPanY = 0;
    let singleTimer = null;

    card.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      dragging = true; moved = false;
      startX = e.clientX; startY = e.clientY;
      origPanX = viewState.panX; origPanY = viewState.panY;
      try { card.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });

    card.addEventListener('pointermove', function (e) {
      if (!dragging || !viewState) return;
      // 只有内容放大后（contentScale > 1）才允许拖拽，缩小/未放大时不可拖拽
      if (viewState.contentScale <= 1) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
      if (moved) {
        viewState.panX = origPanX + dx;
        viewState.panY = origPanY + dy;
        applyContentTransform();
      }
    });

    card.addEventListener('pointerup', function () {
      if (!dragging || !viewState) return;
      dragging = false;
      if (!moved) {
        if (singleTimer) clearTimeout(singleTimer);
        singleTimer = setTimeout(function () {
          singleTimer = null;
          zoomContent(viewState && viewState.zoomDir === 'out' ? 1 / 1.2 : 1.2);
        }, 260);
      }
    });

    card.addEventListener('dblclick', function () {
      if (singleTimer) { clearTimeout(singleTimer); singleTimer = null; }
      requestExitViewMode();
    });

    card.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      openZoomMenu(e.clientX, e.clientY);
    });
  }

  function openZoomMenu(x, y) {
    zoomMenu.classList.add('open');
    const w = zoomMenu.offsetWidth, h = zoomMenu.offsetHeight;
    let left = x, top = y;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    zoomMenu.style.left = left + 'px';
    zoomMenu.style.top = top + 'px';
  }

  function closeZoomMenu() { zoomMenu.classList.remove('open'); }

  zoomMenu.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-zoom]');
    if (!btn) return;
    if (viewState) viewState.zoomDir = btn.dataset.zoom;
    zoomContent(btn.dataset.zoom === 'in' ? 1.2 : 1 / 1.2);
    closeZoomMenu();
  });

  document.addEventListener('click', function (e) {
    if (zoomMenu.classList.contains('open') && !zoomMenu.contains(e.target)) closeZoomMenu();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (zoomMenu.classList.contains('open')) { closeZoomMenu(); return; }
    if (confirmOverlay.classList.contains('open')) { resolveConfirm(false); return; }
    if (pointOverlay.classList.contains('open')) { closePointEditor(); return; }
    if (chartsOverlay.classList.contains('open') && !viewState) { closeCharts(); }
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
  renderTodo();
  renderProducts();
  renderCalendar();
})();
