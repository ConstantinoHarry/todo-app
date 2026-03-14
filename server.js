const path = require('path');
const express = require('express');
const methodOverride = require('method-override');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const todoRoutes = require('./routes/todos');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

app.use('/', authRoutes);
app.use('/', todoRoutes);

app.use((req, res) => {
  res.status(404).render('index', {
    title: 'Todo App',
    todos: [],
    openTodos: [],
    completedTodos: [],
    selectedEnergy: 'all',
    focusMode: false,
    search: '',
    energyBudget: { high: 3, medium: 2, low: 1 },
    counts: { total: 0, completed: 0, open: 0 },
    focusMessage: '',
    error: 'Page not found.',
    success: '',
    returnTo: '/'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});