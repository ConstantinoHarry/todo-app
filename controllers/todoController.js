const {
  getAllTodos,
  getTodoById,
  createTodo: createTodoModel,
  toggleTodo: toggleTodoModel,
  updateTodo: updateTodoModel,
  updateTodoDeadline: updateTodoDeadlineModel,
  deleteTodo: deleteTodoModel,
  clearCompletedTodos: clearCompletedTodosModel
} = require('../models/todoModel');

const {
  createSubtask: createSubtaskModel,
  toggleSubtask: toggleSubtaskModel,
  deleteSubtask: deleteSubtaskModel
} = require('../models/subtaskModel');

const ALLOWED_ENERGY_LEVELS = ['high', 'medium', 'low'];
const ALLOWED_LIST_VIEWS = ['required', 'completed', 'calendar'];
const ALLOWED_ENERGY_FILTERS = ['all', ...ALLOWED_ENERGY_LEVELS];
const ALLOWED_DUE_FILTERS = ['all', 'today', 'overdue', 'upcoming', 'none'];
const ALLOWED_PROGRESS_FILTERS = ['all', 'today', 'week', 'month'];
const ALLOWED_CARRYOVER_ACTIONS = ['do-today', 'move-tomorrow', 'unschedule', 'park'];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseDeadline(raw) {
  if (!raw || typeof raw !== 'string' || raw.trim() === '') return null;
  // datetime-local sends '2026-03-14T14:30' — MySQL needs '2026-03-14 14:30:00'
  const normalized = raw.trim().replace('T', ' ');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(normalized)) return null;
  return normalized;
}

function parseSubtasksInput(raw) {
  if (!raw || typeof raw !== 'string' || raw.trim() === '') {
    return { subtasks: [], error: '' };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return { subtasks: [], error: 'Invalid subtask format.' };
    }

    const subtasks = [];

    for (const value of parsed) {
      if (typeof value !== 'string') {
        return { subtasks: [], error: 'Each subtask must be text.' };
      }

      const trimmed = value.trim();

      if (!trimmed) {
        continue;
      }

      if (trimmed.length > 255) {
        return { subtasks: [], error: 'Subtask text must be 255 characters or fewer.' };
      }

      subtasks.push(trimmed);

      if (subtasks.length > 20) {
        return { subtasks: [], error: 'You can add up to 20 subtasks at once.' };
      }
    }

    return { subtasks, error: '' };
  } catch (error) {
    return { subtasks: [], error: 'Invalid subtask data.' };
  }
}

function getSafeReturnTo(returnTo) {
  if (typeof returnTo !== 'string') {
    return '/';
  }

  if (!returnTo.startsWith('/')) {
    return '/';
  }

  return returnTo;
}

function addMessageToPath(path, key, message) {
  const queryChar = path.includes('?') ? '&' : '?';
  return `${path}${queryChar}${key}=${encodeURIComponent(message)}`;
}

function normalizeListView(raw) {
  if (typeof raw !== 'string') {
    return 'required';
  }

  return ALLOWED_LIST_VIEWS.includes(raw) ? raw : 'required';
}

function normalizeEnergyFilter(raw) {
  if (typeof raw !== 'string') {
    return 'all';
  }

  return ALLOWED_ENERGY_FILTERS.includes(raw) ? raw : 'all';
}

function normalizeDueFilter(raw) {
  if (typeof raw !== 'string') {
    return 'all';
  }

  return ALLOWED_DUE_FILTERS.includes(raw) ? raw : 'all';
}

function normalizeProgressFilter(raw) {
  if (typeof raw !== 'string') {
    return 'all';
  }

  return ALLOWED_PROGRESS_FILTERS.includes(raw) ? raw : 'all';
}

function getMonthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeCalendarMonth(raw) {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}$/.test(raw)) {
    return getMonthKey(new Date());
  }

  const [yearValue, monthValue] = raw.split('-');
  const year = Number(yearValue);
  const month = Number(monthValue);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return getMonthKey(new Date());
  }

  return `${year}-${String(month).padStart(2, '0')}`;
}

function normalizeCalendarDate(raw) {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return '';
  }

  const date = new Date(`${raw}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return getDateKey(date) === raw ? raw : '';
}

function formatDateForSql(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function getDeadlineTimeParts(deadline) {
  if (!deadline) {
    return { hours: 9, minutes: 0 };
  }

  const date = new Date(deadline);

  if (Number.isNaN(date.getTime())) {
    return { hours: 9, minutes: 0 };
  }

  return {
    hours: date.getHours(),
    minutes: date.getMinutes()
  };
}

function buildCarryoverReview(allTodos) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const openScheduledTodos = allTodos
    .filter((todo) => !todo.completed && todo.deadline)
    .map((todo) => {
      const deadlineDate = new Date(todo.deadline);

      if (Number.isNaN(deadlineDate.getTime())) {
        return null;
      }

      return {
        ...todo,
        _deadlineDate: deadlineDate
      };
    })
    .filter(Boolean)
    .sort((left, right) => left._deadlineDate - right._deadlineDate);

  const overdueTasks = openScheduledTodos.filter((todo) => todo._deadlineDate < todayStart);
  const dueTodayTasks = openScheduledTodos.filter(
    (todo) => todo._deadlineDate >= todayStart && todo._deadlineDate < tomorrowStart
  );

  return {
    overdueTasks,
    dueTodayTasks,
    overdueCount: overdueTasks.length,
    dueTodayCount: dueTodayTasks.length,
    totalCount: overdueTasks.length + dueTodayTasks.length
  };
}

function getListPath({ view, energy, due, progress, month, date }) {
  const params = new URLSearchParams();

  if (view && view !== 'required') {
    params.set('view', view);
  }

  if (energy && energy !== 'all') {
    params.set('energy', energy);
  }

  if (due && due !== 'all') {
    params.set('due', due);
  }

  if (progress && progress !== 'all') {
    params.set('progress', progress);
  }

  if (month) {
    params.set('month', month);
  }

  if (date) {
    params.set('date', date);
  }

  const queryString = params.toString();
  return queryString ? `/?${queryString}` : '/';
}

function filterTodosByEnergyAndDue(todos, energyFilter, dueFilter) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  return todos.filter((todo) => {
    if (energyFilter !== 'all' && todo.energy_level !== energyFilter) {
      return false;
    }

    if (dueFilter === 'all') {
      return true;
    }

    if (!todo.deadline) {
      return dueFilter === 'none';
    }

    const deadlineDate = new Date(todo.deadline);

    if (Number.isNaN(deadlineDate.getTime())) {
      return dueFilter === 'none';
    }

    if (dueFilter === 'none') {
      return false;
    }

    if (dueFilter === 'today') {
      return deadlineDate >= todayStart && deadlineDate < tomorrowStart;
    }

    if (dueFilter === 'overdue') {
      return deadlineDate < now;
    }

    if (dueFilter === 'upcoming') {
      return deadlineDate >= now;
    }

    return true;
  });
}

function buildCounts(allTodos) {
  return {
    total: allTodos.length,
    completed: allTodos.filter((todo) => todo.completed).length,
    open: allTodos.filter((todo) => !todo.completed).length
  };
}

function getProgressSummary(allTodos, progressFilter) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const scopedTodos = allTodos.filter((todo) => {
    if (progressFilter === 'all') {
      return true;
    }

    if (!todo.deadline) {
      return false;
    }

    const deadlineDate = new Date(todo.deadline);

    if (Number.isNaN(deadlineDate.getTime())) {
      return false;
    }

    if (progressFilter === 'today') {
      return deadlineDate >= todayStart && deadlineDate < tomorrowStart;
    }

    if (progressFilter === 'week') {
      return deadlineDate >= todayStart && deadlineDate < weekEnd;
    }

    if (progressFilter === 'month') {
      return deadlineDate >= monthStart && deadlineDate < nextMonthStart;
    }

    return true;
  });

  const total = scopedTodos.length;
  const completed = scopedTodos.filter((todo) => todo.completed).length;
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    completed,
    rate
  };
}

function buildCalendarView(todos, monthKey, selectedDateKey) {
  const normalizedMonth = normalizeCalendarMonth(monthKey);
  const [yearValue, monthValue] = normalizedMonth.split('-');
  const year = Number(yearValue);
  const monthIndex = Number(monthValue) - 1;
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0);
  const gridStart = new Date(year, monthIndex, 1 - monthStart.getDay());
  const gridEnd = new Date(year, monthIndex, monthEnd.getDate() + (6 - monthEnd.getDay()));
  const todayKey = getDateKey(new Date());

  const tasksByDate = new Map();
  let scheduledTaskCount = 0;

  todos.forEach((todo) => {
    if (!todo.deadline) {
      return;
    }

    const deadlineDate = new Date(todo.deadline);

    if (Number.isNaN(deadlineDate.getTime())) {
      return;
    }

    const dateKey = getDateKey(deadlineDate);
    const timeLabel = deadlineDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });

    if (!tasksByDate.has(dateKey)) {
      tasksByDate.set(dateKey, []);
    }

    tasksByDate.get(dateKey).push({
      id: todo.id,
      text: todo.text,
      completed: Boolean(todo.completed),
      energy_level: todo.energy_level,
      timeLabel,
      deadline: todo.deadline
    });

    scheduledTaskCount += 1;
  });

  tasksByDate.forEach((items) => {
    items.sort((left, right) => {
      if (left.completed !== right.completed) {
        return left.completed ? 1 : -1;
      }

      return new Date(left.deadline) - new Date(right.deadline);
    });
  });

  const weeks = [];
  const cursor = new Date(gridStart);

  while (cursor <= gridEnd) {
    const week = [];

    for (let index = 0; index < 7; index += 1) {
      const dateKey = getDateKey(cursor);
      week.push({
        dateKey,
        dayNumber: cursor.getDate(),
        inCurrentMonth: cursor.getMonth() === monthIndex,
        isToday: dateKey === todayKey,
        isSelected: dateKey === selectedDateKey,
        tasks: tasksByDate.get(dateKey) || []
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    weeks.push(week);
  }

  const prevMonth = new Date(year, monthIndex - 1, 1);
  const nextMonth = new Date(year, monthIndex + 1, 1);

  return {
    monthKey: normalizedMonth,
    monthLabel: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    weekdayLabels: WEEKDAY_LABELS,
    weeks,
    todayMonthKey: getMonthKey(new Date()),
    todayDateKey: todayKey,
    prevMonthKey: getMonthKey(prevMonth),
    nextMonthKey: getMonthKey(nextMonth),
    scheduledTaskCount
  };
}

function buildCalendarAgenda(todos, selectedDateKey) {
  if (!selectedDateKey) {
    return null;
  }

  const selectedDate = new Date(`${selectedDateKey}T00:00:00`);

  if (Number.isNaN(selectedDate.getTime())) {
    return null;
  }

  const tasks = todos
    .filter((todo) => {
      if (!todo.deadline) {
        return false;
      }

      const deadlineDate = new Date(todo.deadline);

      if (Number.isNaN(deadlineDate.getTime())) {
        return false;
      }

      return getDateKey(deadlineDate) === selectedDateKey;
    })
    .sort((left, right) => {
      if (left.completed !== right.completed) {
        return left.completed ? 1 : -1;
      }

      return new Date(left.deadline) - new Date(right.deadline);
    });

  return {
    dateKey: selectedDateKey,
    label: selectedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }),
    tasks
  };
}

async function renderHome(req, res) {
  try {
    const userId = req.session && req.session.user ? req.session.user.id : null;
    if (!userId) {
      return res.redirect('/login?error=' + encodeURIComponent('Please login to continue.'));
    }

    const selectedView = normalizeListView(req.query.view);
    const selectedEnergyFilter = normalizeEnergyFilter(req.query.energy);
    const selectedDueFilter = normalizeDueFilter(req.query.due);
    const selectedProgressFilter = normalizeProgressFilter(req.query.progress);
    const selectedCalendarMonth = normalizeCalendarMonth(req.query.month);
    const normalizedSelectedCalendarDate = normalizeCalendarDate(req.query.date);
    const selectedCalendarDate = normalizedSelectedCalendarDate.startsWith(selectedCalendarMonth)
      ? normalizedSelectedCalendarDate
      : '';

    const allTodos = await getAllTodos(userId);
    const openTodos = allTodos.filter((todo) => !todo.completed);
    const completedTodos = allTodos.filter((todo) => todo.completed);
    const sourceTodos = selectedView === 'completed'
      ? completedTodos
      : selectedView === 'calendar'
        ? allTodos
        : openTodos;
    const visibleTodos = filterTodosByEnergyAndDue(sourceTodos, selectedEnergyFilter, selectedDueFilter);
    const counts = buildCounts(allTodos);
    const progressSummary = getProgressSummary(allTodos, selectedProgressFilter);
    const calendarView = buildCalendarView(visibleTodos, selectedCalendarMonth, selectedCalendarDate);
    const calendarAgenda = buildCalendarAgenda(visibleTodos, selectedCalendarDate);
    const carryoverReview = buildCarryoverReview(allTodos);

    const error = typeof req.query.error === 'string' ? req.query.error : '';
    const success = typeof req.query.success === 'string' ? req.query.success : '';
    const returnTo = getListPath({
      view: selectedView,
      energy: selectedEnergyFilter,
      due: selectedDueFilter,
      progress: selectedProgressFilter,
      month: selectedCalendarMonth,
      date: selectedCalendarDate
    });

    res.render('index', {
      title: 'Todo App',
      todos: allTodos,
      openTodos,
      completedTodos,
      visibleTodos,
      selectedView,
      selectedEnergyFilter,
      selectedDueFilter,
      selectedProgressFilter,
      selectedCalendarMonth,
      selectedCalendarDate,
      counts,
      progressSummary,
      calendarView,
      calendarAgenda,
      carryoverReview,
      error,
      success,
      returnTo
    });
  } catch (error) {
    console.error('Failed to load todos:', error);

    res.status(500).render('index', {
      title: 'Todo App',
      todos: [],
      openTodos: [],
      completedTodos: [],
      visibleTodos: [],
      selectedView: 'required',
      selectedEnergyFilter: 'all',
      selectedDueFilter: 'all',
      selectedProgressFilter: 'all',
      selectedCalendarMonth: getMonthKey(new Date()),
      selectedCalendarDate: '',
      counts: { total: 0, completed: 0, open: 0 },
      progressSummary: { total: 0, completed: 0, rate: 0 },
      calendarView: buildCalendarView([], getMonthKey(new Date()), ''),
      calendarAgenda: null,
      carryoverReview: {
        overdueTasks: [],
        dueTodayTasks: [],
        overdueCount: 0,
        dueTodayCount: 0,
        totalCount: 0
      },
      error: 'Unable to load todos right now. Please try again.',
      success: '',
      returnTo: '/'
    });
  }
}

async function applyCarryoverAction(req, res) {
  const returnTo = getSafeReturnTo(req.body.returnTo || '/');

  try {
    const userId = req.session && req.session.user ? req.session.user.id : null;
    if (!userId) {
      return res.redirect('/login?error=' + encodeURIComponent('Please login to continue.'));
    }

    const id = Number.parseInt(req.params.id, 10);
    const action = typeof req.body.action === 'string' ? req.body.action : '';

    if (Number.isNaN(id)) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Invalid task ID.'));
    }

    if (!ALLOWED_CARRYOVER_ACTIONS.includes(action)) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Invalid carryover action.'));
    }

    const todo = await getTodoById(userId, id);

    if (!todo) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Task not found.'));
    }

    if (todo.completed) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Completed tasks cannot be rescheduled from carryover.'));
    }

    const now = new Date();
    const timeParts = getDeadlineTimeParts(todo.deadline);
    let nextDeadline = null;
    let successMessage = 'Task updated.';

    if (action === 'do-today') {
      const todayDeadline = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        timeParts.hours,
        timeParts.minutes,
        0
      );
      nextDeadline = formatDateForSql(todayDeadline);
      successMessage = 'Task scheduled for today.';
    }

    if (action === 'move-tomorrow') {
      const tomorrowDeadline = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        timeParts.hours,
        timeParts.minutes,
        0
      );
      nextDeadline = formatDateForSql(tomorrowDeadline);
      successMessage = 'Task moved to tomorrow.';
    }

    if (action === 'unschedule' || action === 'park') {
      nextDeadline = null;
      successMessage = 'Task unscheduled (deadline removed).';
    }

    await updateTodoDeadlineModel(userId, id, nextDeadline);
    return res.redirect(addMessageToPath(returnTo, 'success', successMessage));
  } catch (error) {
    console.error('Failed to apply carryover action:', error);
    return res.redirect(addMessageToPath(returnTo, 'error', 'Unable to update task from carryover review right now.'));
  }
}

async function createTodo(req, res) {
  const returnTo = getSafeReturnTo(req.body.returnTo || '/');

  try {
    const userId = req.session && req.session.user ? req.session.user.id : null;
    if (!userId) {
      return res.redirect('/login?error=' + encodeURIComponent('Please login to continue.'));
    }

    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
    const energyLevel = typeof req.body.energyLevel === 'string' ? req.body.energyLevel : '';
    const deadline = parseDeadline(req.body.deadline);
    const { subtasks, error: subtaskError } = parseSubtasksInput(req.body.subtasksJson);

    if (!text) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Task text is required.'));
    }

    if (text.length > 255) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Task text must be 255 characters or fewer.'));
    }

    if (description.length > 1000) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Task description must be 1000 characters or fewer.'));
    }

    if (!ALLOWED_ENERGY_LEVELS.includes(energyLevel)) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Please choose a valid energy level.'));
    }

    if (subtaskError) {
      return res.redirect(addMessageToPath(returnTo, 'error', subtaskError));
    }

    const todoId = await createTodoModel(userId, text, description, energyLevel, deadline);

    for (const subtaskText of subtasks) {
      await createSubtaskModel(userId, todoId, subtaskText);
    }

    return res.redirect(addMessageToPath(returnTo, 'success', 'Task added successfully.'));
  } catch (error) {
    console.error('Failed to create todo:', error);
    return res.redirect(addMessageToPath(returnTo, 'error', 'Unable to create task right now.'));
  }
}

async function toggleTodo(req, res) {
  const returnTo = getSafeReturnTo(req.body.returnTo || '/');

  try {
    const userId = req.session && req.session.user ? req.session.user.id : null;
    if (!userId) {
      return res.redirect('/login?error=' + encodeURIComponent('Please login to continue.'));
    }

    const id = Number.parseInt(req.params.id, 10);

    if (Number.isNaN(id)) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Invalid task ID.'));
    }

    await toggleTodoModel(userId, id);
    return res.redirect(returnTo);
  } catch (error) {
    console.error('Failed to toggle todo:', error);
    return res.redirect(addMessageToPath(returnTo, 'error', 'Unable to update task status.'));
  }
}

async function updateTodo(req, res) {
  const returnTo = getSafeReturnTo(req.body.returnTo || '/');

  try {
    const userId = req.session && req.session.user ? req.session.user.id : null;
    if (!userId) {
      return res.redirect('/login?error=' + encodeURIComponent('Please login to continue.'));
    }

    const id = Number.parseInt(req.params.id, 10);
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    const energyLevel = typeof req.body.energyLevel === 'string' ? req.body.energyLevel : '';
    const deadline = parseDeadline(req.body.deadline);

    if (Number.isNaN(id)) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Invalid task ID.'));
    }

    if (!text) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Task text is required.'));
    }

    if (text.length > 255) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Task text must be 255 characters or fewer.'));
    }

    if (!ALLOWED_ENERGY_LEVELS.includes(energyLevel)) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Please choose a valid energy level.'));
    }

    await updateTodoModel(userId, id, text, energyLevel, deadline);
    return res.redirect(addMessageToPath(returnTo, 'success', 'Task updated successfully.'));
  } catch (error) {
    console.error('Failed to update todo:', error);
    return res.redirect(addMessageToPath(returnTo, 'error', 'Unable to update task right now.'));
  }
}

async function deleteTodo(req, res) {
  const returnTo = getSafeReturnTo(req.body.returnTo || '/');

  try {
    const userId = req.session && req.session.user ? req.session.user.id : null;
    if (!userId) {
      return res.redirect('/login?error=' + encodeURIComponent('Please login to continue.'));
    }

    const id = Number.parseInt(req.params.id, 10);

    if (Number.isNaN(id)) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Invalid task ID.'));
    }

    await deleteTodoModel(userId, id);
    return res.redirect(addMessageToPath(returnTo, 'success', 'Task deleted.'));
  } catch (error) {
    console.error('Failed to delete todo:', error);
    return res.redirect(addMessageToPath(returnTo, 'error', 'Unable to delete task right now.'));
  }
}

async function clearCompletedTodos(req, res) {
  const returnTo = getSafeReturnTo(req.body.returnTo || '/');

  try {
    const userId = req.session && req.session.user ? req.session.user.id : null;
    if (!userId) {
      return res.redirect('/login?error=' + encodeURIComponent('Please login to continue.'));
    }

    await clearCompletedTodosModel(userId);
    return res.redirect(addMessageToPath(returnTo, 'success', 'Completed tasks cleared for today.'));
  } catch (error) {
    console.error('Failed to clear completed todos:', error);
    return res.redirect(addMessageToPath(returnTo, 'error', 'Unable to clear completed tasks right now.'));
  }
}

async function createSubtask(req, res) {
  const returnTo = getSafeReturnTo(req.body.returnTo || '/');

  try {
    const userId = req.session && req.session.user ? req.session.user.id : null;
    if (!userId) {
      return res.redirect('/login?error=' + encodeURIComponent('Please login to continue.'));
    }

    const todoId = Number.parseInt(req.params.id, 10);
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';

    if (Number.isNaN(todoId)) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Invalid task ID.'));
    }

    if (!text) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Subtask text is required.'));
    }

    if (text.length > 255) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Subtask text must be 255 characters or fewer.'));
    }

    await createSubtaskModel(userId, todoId, text);
    return res.redirect(returnTo);
  } catch (error) {
    console.error('Failed to create subtask:', error);
    return res.redirect(addMessageToPath(returnTo, 'error', 'Unable to add subtask right now.'));
  }
}

async function toggleSubtask(req, res) {
  const returnTo = getSafeReturnTo(req.body.returnTo || '/');

  try {
    const userId = req.session && req.session.user ? req.session.user.id : null;
    if (!userId) {
      return res.redirect('/login?error=' + encodeURIComponent('Please login to continue.'));
    }

    const subtaskId = Number.parseInt(req.params.sid, 10);

    if (Number.isNaN(subtaskId)) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Invalid subtask ID.'));
    }

    await toggleSubtaskModel(userId, subtaskId);
    return res.redirect(returnTo);
  } catch (error) {
    console.error('Failed to toggle subtask:', error);
    return res.redirect(addMessageToPath(returnTo, 'error', 'Unable to update subtask.'));
  }
}

async function deleteSubtask(req, res) {
  const returnTo = getSafeReturnTo(req.body.returnTo || '/');

  try {
    const userId = req.session && req.session.user ? req.session.user.id : null;
    if (!userId) {
      return res.redirect('/login?error=' + encodeURIComponent('Please login to continue.'));
    }

    const subtaskId = Number.parseInt(req.params.sid, 10);

    if (Number.isNaN(subtaskId)) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Invalid subtask ID.'));
    }

    await deleteSubtaskModel(userId, subtaskId);
    return res.redirect(returnTo);
  } catch (error) {
    console.error('Failed to delete subtask:', error);
    return res.redirect(addMessageToPath(returnTo, 'error', 'Unable to delete subtask.'));
  }
}

module.exports = {
  renderHome,
  createTodo,
  toggleTodo,
  updateTodo,
  applyCarryoverAction,
  deleteTodo,
  clearCompletedTodos,
  createSubtask,
  toggleSubtask,
  deleteSubtask
};
