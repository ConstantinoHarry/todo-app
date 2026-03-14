const {
  getAllTodos,
  createTodo: createTodoModel,
  toggleTodo: toggleTodoModel,
  updateTodo: updateTodoModel,
  deleteTodo: deleteTodoModel,
  clearCompletedTodos: clearCompletedTodosModel
} = require('../models/todoModel');

const ALLOWED_ENERGY_LEVELS = ['high', 'medium', 'low'];
const ENERGY_BUDGET = { high: 3, medium: 2, low: 1 };

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

function getBaseQueryPath({ focusMode, selectedEnergy, search }) {
  const params = new URLSearchParams();

  if (focusMode) {
    params.set('focus', 'true');
  }

  params.set('energy', selectedEnergy || 'all');

  if (search) {
    params.set('search', search);
  }

  const queryString = params.toString();
  return queryString ? `/?${queryString}` : '/';
}

function normalizeSearch(search) {
  return typeof search === 'string' ? search.trim() : '';
}

function filterTodosBySearch(todos, search) {
  if (!search) {
    return todos;
  }

  const searchLower = search.toLowerCase();
  return todos.filter((todo) => todo.text.toLowerCase().includes(searchLower));
}

function buildCounts(allTodos) {
  return {
    total: allTodos.length,
    completed: allTodos.filter((todo) => todo.completed).length,
    open: allTodos.filter((todo) => !todo.completed).length
  };
}

function applyFocusMode(openTodos, focusMode, selectedEnergy) {
  let visibleOpenTodos = openTodos;
  let focusMessage = '';

  if (!focusMode) {
    return { visibleOpenTodos, focusMessage };
  }

  if (selectedEnergy === 'all') {
    focusMessage = 'Focus Mode is on. Select an energy level to apply your daily task budget.';
    return { visibleOpenTodos, focusMessage };
  }

  const limit = ENERGY_BUDGET[selectedEnergy];
  visibleOpenTodos = openTodos.slice(0, limit);
  focusMessage = `Showing up to ${limit} open ${selectedEnergy}-energy task(s) for this session.`;

  return { visibleOpenTodos, focusMessage };
}

async function renderHome(req, res) {
  try {
    const userId = req.session && req.session.user ? req.session.user.id : null;
    if (!userId) {
      return res.redirect('/login?error=' + encodeURIComponent('Please login to continue.'));
    }

    const focusMode = req.query.focus === 'true';
    const selectedEnergy = ALLOWED_ENERGY_LEVELS.includes(req.query.energy)
      ? req.query.energy
      : 'all';
    const search = normalizeSearch(req.query.search);

    const dbFilter = selectedEnergy === 'all' ? {} : { energyLevel: selectedEnergy };
    const allTodosFromDb = await getAllTodos(userId, dbFilter);
    const searchedTodos = filterTodosBySearch(allTodosFromDb, search);

    const openTodos = searchedTodos.filter((todo) => !todo.completed);
    const completedTodos = searchedTodos.filter((todo) => todo.completed);

    const { visibleOpenTodos, focusMessage } = applyFocusMode(openTodos, focusMode, selectedEnergy);

    const todos = [...visibleOpenTodos, ...completedTodos];
    const counts = buildCounts(searchedTodos);

    const error = typeof req.query.error === 'string' ? req.query.error : '';
    const success = typeof req.query.success === 'string' ? req.query.success : '';
    const returnTo = getBaseQueryPath({ focusMode, selectedEnergy, search });

    res.render('index', {
      title: 'Todo App',
      todos,
      openTodos: visibleOpenTodos,
      completedTodos,
      selectedEnergy,
      focusMode,
      search,
      energyBudget: ENERGY_BUDGET,
      counts,
      focusMessage,
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
      selectedEnergy: 'all',
      focusMode: false,
      search: '',
      energyBudget: ENERGY_BUDGET,
      counts: { total: 0, completed: 0, open: 0 },
      focusMessage: '',
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
    const energyLevel = typeof req.body.energyLevel === 'string' ? req.body.energyLevel : '';

    if (!text) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Task text is required.'));
    }

    if (text.length > 255) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Task text must be 255 characters or fewer.'));
    }

    if (!ALLOWED_ENERGY_LEVELS.includes(energyLevel)) {
      return res.redirect(addMessageToPath(returnTo, 'error', 'Please choose a valid energy level.'));
    }

    await createTodoModel(userId, text, energyLevel);
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

    await updateTodoModel(userId, id, text, energyLevel);
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

module.exports = {
  renderHome,
  createTodo,
  toggleTodo,
  updateTodo,
  deleteTodo,
  clearCompletedTodos
};
