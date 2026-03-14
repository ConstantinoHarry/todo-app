const {
  getAllTodos,
  createTodo: createTodoModel,
  toggleTodo: toggleTodoModel,
  updateTodo: updateTodoModel,
  deleteTodo: deleteTodoModel,
  clearCompletedTodos: clearCompletedTodosModel
} = require('../models/todoModel');

const {
  createSubtask: createSubtaskModel,
  toggleSubtask: toggleSubtaskModel,
  deleteSubtask: deleteSubtaskModel
} = require('../models/subtaskModel');

const ALLOWED_ENERGY_LEVELS = ['high', 'medium', 'low'];
const ALLOWED_LIST_VIEWS = ['required', 'completed'];
const ALLOWED_ENERGY_FILTERS = ['all', ...ALLOWED_ENERGY_LEVELS];
const ALLOWED_DUE_FILTERS = ['all', 'today', 'overdue', 'upcoming', 'none'];
const ALLOWED_PROGRESS_FILTERS = ['all', 'today', 'week'];

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

function getListPath({ view, energy, due, progress }) {
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

    const allTodos = await getAllTodos(userId);
    const openTodos = allTodos.filter((todo) => !todo.completed);
    const completedTodos = allTodos.filter((todo) => todo.completed);
    const sourceTodos = selectedView === 'completed' ? completedTodos : openTodos;
    const visibleTodos = filterTodosByEnergyAndDue(sourceTodos, selectedEnergyFilter, selectedDueFilter);
    const counts = buildCounts(allTodos);
    const progressSummary = getProgressSummary(allTodos, selectedProgressFilter);

    const error = typeof req.query.error === 'string' ? req.query.error : '';
    const success = typeof req.query.success === 'string' ? req.query.success : '';
    const returnTo = getListPath({
      view: selectedView,
      energy: selectedEnergyFilter,
      due: selectedDueFilter,
      progress: selectedProgressFilter
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
      counts,
      progressSummary,
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
      counts: { total: 0, completed: 0, open: 0 },
      progressSummary: { total: 0, completed: 0, rate: 0 },
      error: 'Unable to load todos right now. Please try again.',
      success: '',
      returnTo: '/'
    });
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
  deleteTodo,
  clearCompletedTodos,
  createSubtask,
  toggleSubtask,
  deleteSubtask
};
