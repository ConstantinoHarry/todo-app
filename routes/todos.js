const express = require('express');
const {
  getAllTodos,
  createTodo,
  toggleTodo,
  deleteTodo,
  clearCompletedTodos
} = require('../models/todoModel');

const router = express.Router();

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

function addErrorToPath(path, message) {
  const queryChar = path.includes('?') ? '&' : '?';
  return `${path}${queryChar}error=${encodeURIComponent(message)}`;
}

function getBaseQueryPath(focusMode, selectedEnergy) {
  const params = new URLSearchParams();
  params.set('focus', focusMode ? 'true' : 'false');
  params.set('energy', selectedEnergy);

  return `/?${params.toString()}`;
}

router.get('/', async (req, res) => {
  try {
    const focusMode = req.query.focus === 'true';
    const selectedEnergy = ALLOWED_ENERGY_LEVELS.includes(req.query.energy)
      ? req.query.energy
      : 'all';

    const dbFilter = selectedEnergy === 'all' ? {} : { energyLevel: selectedEnergy };
    const allTodos = await getAllTodos(dbFilter);

    let todos = allTodos;
    let focusMessage = '';

    if (focusMode && selectedEnergy !== 'all') {
      const limit = ENERGY_BUDGET[selectedEnergy];
      todos = allTodos.slice(0, limit);
      focusMessage = `Showing up to ${limit} ${selectedEnergy}-energy tasks`;
    } else if (focusMode && selectedEnergy === 'all') {
      focusMessage = 'Focus Mode is on. Select an energy level to apply your daily task budget.';
    }

    const counts = {
      total: allTodos.length,
      completed: allTodos.filter((todo) => todo.completed).length,
      open: allTodos.filter((todo) => !todo.completed).length
    };

    const error = typeof req.query.error === 'string' ? req.query.error : '';
    const returnTo = getBaseQueryPath(focusMode, selectedEnergy);

    res.render('index', {
      title: 'Todo App',
      todos,
      selectedEnergy,
      focusMode,
      energyBudget: ENERGY_BUDGET,
      counts,
      focusMessage,
      error,
      returnTo
    });
  } catch (error) {
    console.error('Failed to load todos:', error);
    res.status(500).render('index', {
      title: 'Todo App',
      todos: [],
      selectedEnergy: 'all',
      focusMode: false,
      energyBudget: ENERGY_BUDGET,
      counts: { total: 0, completed: 0, open: 0 },
      focusMessage: '',
      error: 'Unable to load todos right now. Please try again.',
      returnTo: '/'
    });
  }
});

router.post('/todos', async (req, res) => {
  const returnTo = getSafeReturnTo(req.body.returnTo || '/');

  try {
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    const energyLevel = typeof req.body.energyLevel === 'string' ? req.body.energyLevel : '';

    if (!text) {
      return res.redirect(addErrorToPath(returnTo, 'Task text is required.'));
    }

    if (!ALLOWED_ENERGY_LEVELS.includes(energyLevel)) {
      return res.redirect(addErrorToPath(returnTo, 'Please choose a valid energy level.'));
    }

    await createTodo(text, energyLevel);
    return res.redirect(returnTo);
  } catch (error) {
    console.error('Failed to create todo:', error);
    return res.redirect(addErrorToPath(returnTo, 'Unable to create task right now.'));
  }
});

router.patch('/todos/:id/toggle', async (req, res) => {
  const returnTo = getSafeReturnTo(req.body.returnTo || '/');

  try {
    const id = Number.parseInt(req.params.id, 10);

    if (Number.isNaN(id)) {
      return res.redirect(addErrorToPath(returnTo, 'Invalid task ID.'));
    }

    await toggleTodo(id);
    return res.redirect(returnTo);
  } catch (error) {
    console.error('Failed to toggle todo:', error);
    return res.redirect(addErrorToPath(returnTo, 'Unable to update task status.'));
  }
});

router.delete('/todos/:id', async (req, res) => {
  const returnTo = getSafeReturnTo(req.body.returnTo || '/');

  try {
    const id = Number.parseInt(req.params.id, 10);

    if (Number.isNaN(id)) {
      return res.redirect(addErrorToPath(returnTo, 'Invalid task ID.'));
    }

    await deleteTodo(id);
    return res.redirect(returnTo);
  } catch (error) {
    console.error('Failed to delete todo:', error);
    return res.redirect(addErrorToPath(returnTo, 'Unable to delete task right now.'));
  }
});

router.post('/todos/clear-completed', async (req, res) => {
  const returnTo = getSafeReturnTo(req.body.returnTo || '/');

  try {
    await clearCompletedTodos();
    return res.redirect(returnTo);
  } catch (error) {
    console.error('Failed to clear completed todos:', error);
    return res.redirect(addErrorToPath(returnTo, 'Unable to clear completed tasks right now.'));
  }
});

module.exports = router;
