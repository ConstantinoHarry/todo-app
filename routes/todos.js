const express = require('express');
const todoController = require('../controllers/todoController');

const router = express.Router();

router.get('/', todoController.renderHome);
router.post('/todos', todoController.createTodo);
router.post('/todos/:id/carryover', todoController.applyCarryoverAction);
router.patch('/todos/:id/toggle', todoController.toggleTodo);
router.patch('/todos/:id', todoController.updateTodo);
router.delete('/todos/:id', todoController.deleteTodo);
router.post('/todos/clear-completed', todoController.clearCompletedTodos);

// Subtask routes
router.post('/todos/:id/subtasks', todoController.createSubtask);
router.patch('/todos/:id/subtasks/:sid/toggle', todoController.toggleSubtask);
router.delete('/todos/:id/subtasks/:sid', todoController.deleteSubtask);

module.exports = router;
