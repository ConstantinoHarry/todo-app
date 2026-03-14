const express = require('express');
const todoController = require('../controllers/todoController');

const router = express.Router();

router.get('/', todoController.renderHome);
router.post('/todos', todoController.createTodo);
router.patch('/todos/:id/toggle', todoController.toggleTodo);
router.patch('/todos/:id', todoController.updateTodo);
router.delete('/todos/:id', todoController.deleteTodo);
router.post('/todos/clear-completed', todoController.clearCompletedTodos);

module.exports = router;
