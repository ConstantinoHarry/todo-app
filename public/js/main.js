document.addEventListener('DOMContentLoaded', () => {
  const clearCompletedForm = document.querySelector('[data-clear-completed-form]');
  const addTaskModal = document.querySelector('[data-add-task-modal]');
  const addTaskOpenButton = document.querySelector('[data-open-add-task-modal]');
  const addTaskCloseButtons = document.querySelectorAll('[data-close-add-task-modal]');
  const addTaskForm = document.querySelector('[data-add-task-form]');
  const subtaskList = document.querySelector('[data-subtask-list]');
  const addSubtaskRowButton = document.querySelector('[data-add-subtask-row]');
  const subtasksJsonInput = document.querySelector('[data-subtasks-json]');
  const deadlineHiddenInput = document.querySelector('[data-deadline-hidden]');
  const taskDateInput = document.querySelector('[data-task-date]');
  const taskTimeInput = document.querySelector('[data-task-time]');
  const taskNameInput = document.getElementById('taskTextModal');
  const focusModeButton = document.querySelector('[data-focus-mode-toggle]');
  const focusModeLabel = document.querySelector('[data-focus-mode-label]');
  const focusModeStorageKey = 'todo-focus-mode-enabled';
  const calendarAgendaModal = document.querySelector('[data-calendar-agenda-modal]');
  const calendarAgendaCloseButton = document.querySelector('[data-calendar-agenda-close]');
  const editTaskModal = document.querySelector('[data-edit-task-modal]');
  const editTaskCloseButtons = document.querySelectorAll('[data-close-edit-task-modal]');
  const editTaskForm = document.querySelector('[data-edit-task-form]');
  const editTaskTextInput = document.querySelector('[data-edit-task-text]');
  const editTaskDescriptionInput = document.querySelector('[data-edit-task-description]');
  const editTaskEnergyInput = document.querySelector('[data-edit-task-energy]');
  const editTaskDeadlineInput = document.querySelector('[data-edit-task-deadline]');
  const editSubtaskForm = document.querySelector('[data-edit-subtask-form]');
  const editSubtaskInput = document.querySelector('[data-edit-subtask-input]');
  const editSubtaskList = document.querySelector('[data-edit-subtask-list]');
  const editSubtaskEmptyState = document.querySelector('[data-edit-subtask-empty]');
  const editSubtaskOpenButton = document.querySelector('[data-edit-subtask-open]');
  const editSubtaskCancelButton = document.querySelector('[data-edit-subtask-cancel]');
  let activeEditTodoId = '';
  let activeEditTodoElement = null;
  let activeEditSubtasks = [];

  function parseTodoSubtasks(rawSubtasks) {
    if (typeof rawSubtasks !== 'string' || !rawSubtasks.trim()) {
      return [];
    }

    try {
      const parsed = JSON.parse(rawSubtasks);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter((subtask) => subtask && typeof subtask === 'object')
        .map((subtask) => ({
          id: Number(subtask.id),
          text: typeof subtask.text === 'string' ? subtask.text : '',
          completed: Boolean(subtask.completed)
        }))
        .filter((subtask) => Number.isInteger(subtask.id) && subtask.id > 0 && subtask.text.trim());
    } catch (error) {
      return [];
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showEditSubtaskForm(visible) {
    if (!editSubtaskForm) {
      return;
    }

    editSubtaskForm.hidden = !visible;

    if (!visible && editSubtaskInput) {
      editSubtaskInput.value = '';
    }
  }

  function renderEditSubtasks() {
    if (!editSubtaskList) {
      return;
    }

    editSubtaskList.innerHTML = activeEditSubtasks.map((subtask) => {
      const subtaskId = Number(subtask.id);
      const inputId = `edit-subtask-${subtaskId}`;
      return `
        <li class="subtask-row" data-edit-subtask-row="${subtaskId}">
          <label class="checkbox-row subtask-label" for="${inputId}">
            <input
              id="${inputId}"
              type="checkbox"
              data-edit-subtask-toggle="${subtaskId}"
              ${subtask.completed ? 'checked' : ''}
            />
            <span class="subtask-text ${subtask.completed ? 'is-done' : ''}">${escapeHtml(subtask.text)}</span>
          </label>
          <button
            type="button"
            class="subtask-delete-btn"
            aria-label="Delete subtask"
            data-edit-subtask-delete="${subtaskId}"
          >&times;</button>
        </li>
      `;
    }).join('');

    if (editSubtaskEmptyState) {
      editSubtaskEmptyState.hidden = activeEditSubtasks.length > 0;
    }

    if (activeEditTodoElement) {
      activeEditTodoElement.dataset.todoSubtasks = JSON.stringify(activeEditSubtasks);
    }
  }

  function getEditModalMeta() {
    const csrfInput = editTaskForm && editTaskForm.querySelector('input[name="_csrf"]');
    const returnToInput = editTaskForm && editTaskForm.querySelector('input[name="returnTo"]');

    return {
      csrfToken: csrfInput ? csrfInput.value : '',
      returnTo: returnToInput ? returnToInput.value : '/'
    };
  }

  async function submitSubtaskModalRequest(url, params) {
    const response = await window.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: params.toString()
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload || !payload.success) {
      throw new Error(payload && payload.error ? payload.error : 'Unable to update subtask right now.');
    }

    return payload;
  }

  function closeCalendarAgendaModal() {
    if (!calendarAgendaCloseButton || !calendarAgendaCloseButton.href) {
      return;
    }

    window.location.assign(calendarAgendaCloseButton.href);
  }

  function applyFocusMode(enabled) {
    document.body.classList.toggle('focus-mode', enabled);

    if (!focusModeButton) {
      return;
    }

    focusModeButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    focusModeButton.classList.toggle('is-active', enabled);

    if (focusModeLabel) {
      focusModeLabel.textContent = enabled ? 'Focus Mode On' : 'Focus Mode';
    }
  }

  if (focusModeButton) {
    let initialFocusMode = false;

    try {
      initialFocusMode = window.localStorage.getItem(focusModeStorageKey) === 'true';
    } catch (error) {
      initialFocusMode = false;
    }

    applyFocusMode(initialFocusMode);

    focusModeButton.addEventListener('click', () => {
      const nextState = !document.body.classList.contains('focus-mode');
      applyFocusMode(nextState);

      try {
        window.localStorage.setItem(focusModeStorageKey, String(nextState));
      } catch (error) {
        // Ignore storage errors in restricted environments
      }
    });
  }

  if (clearCompletedForm) {
    clearCompletedForm.addEventListener('submit', (event) => {
      const confirmed = window.confirm(
        'Archive and remove all completed tasks for today?'
      );

      if (!confirmed) {
        event.preventDefault();
      }
    });
  }

  function createSubtaskRow(value = '') {
    const row = document.createElement('div');
    row.className = 'task-subtask-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 255;
    input.placeholder = 'e.g. Draft outline';
    input.setAttribute('data-subtask-input', '');
    input.value = value;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'subtask-delete-btn';
    removeButton.setAttribute('aria-label', 'Remove subtask');
    removeButton.setAttribute('data-remove-subtask', '');
    removeButton.innerHTML = '&times;';

    row.appendChild(input);
    row.appendChild(removeButton);
    return row;
  }

  function closeAddTaskModal() {
    if (!addTaskModal) {
      return;
    }

    addTaskModal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  function closeEditTaskModal() {
    if (!editTaskModal) {
      return;
    }

    editTaskModal.hidden = true;
    activeEditTodoId = '';
    activeEditTodoElement = null;
    activeEditSubtasks = [];
    renderEditSubtasks();
    showEditSubtaskForm(false);
    if (!addTaskModal || addTaskModal.hidden) {
      document.body.classList.remove('modal-open');
    }
  }

  function openAddTaskModal() {
    if (!addTaskModal) {
      return;
    }

    resetAddTaskForm();
    addTaskModal.hidden = false;
    document.body.classList.add('modal-open');
    if (taskNameInput) {
      taskNameInput.focus();
    }
  }

  function openEditTaskModal(todo) {
    if (!editTaskModal || !editTaskForm || !todo) {
      return;
    }

    const todoId = todo.dataset.todoId;
    if (!todoId) {
      return;
    }

    activeEditTodoId = todoId;
    activeEditTodoElement = todo;
    activeEditSubtasks = parseTodoSubtasks(todo.dataset.todoSubtasks);
    renderEditSubtasks();
    showEditSubtaskForm(false);

    editTaskForm.action = `/todos/${todoId}?_method=PATCH`;

    if (editSubtaskForm) {
      editSubtaskForm.action = `/todos/${todoId}/subtasks`;
    }

    if (editSubtaskInput) {
      editSubtaskInput.value = '';
    }

    if (editTaskTextInput) {
      editTaskTextInput.value = todo.dataset.todoText || '';
    }

    if (editTaskDescriptionInput) {
      editTaskDescriptionInput.value = todo.dataset.todoDescription || '';
    }

    if (editTaskEnergyInput) {
      editTaskEnergyInput.value = todo.dataset.todoEnergy || 'medium';
    }

    if (editTaskDeadlineInput) {
      editTaskDeadlineInput.value = todo.dataset.todoDeadline || '';
    }

    editTaskModal.hidden = false;
    document.body.classList.add('modal-open');

    if (editTaskTextInput) {
      editTaskTextInput.focus();
      editTaskTextInput.select();
    }
  }

  function shouldIgnoreEditTrigger(target) {
    return Boolean(
      target.closest('input[type="checkbox"], button, a, select, textarea, details, summary, .subtask-section, .todo-actions, .calendar-agenda-actions, .calendar-agenda-add-panel')
    );
  }

  function collectSubtasks() {
    if (!subtaskList) {
      return [];
    }

    const subtasks = [];
    const inputs = subtaskList.querySelectorAll('[data-subtask-input]');

    inputs.forEach((input) => {
      const value = typeof input.value === 'string' ? input.value.trim() : '';
      if (value) {
        subtasks.push(value);
      }
    });

    return subtasks;
  }

  function resetAddTaskForm(options = {}) {
    const shouldResetNativeForm = options.resetNativeForm !== false;

    if (addTaskForm && shouldResetNativeForm) {
      addTaskForm.reset();
    }

    if (subtaskList) {
      subtaskList.innerHTML = '';
      subtaskList.appendChild(createSubtaskRow());
    }

    if (subtasksJsonInput) {
      subtasksJsonInput.value = '[]';
    }

    if (deadlineHiddenInput) {
      deadlineHiddenInput.value = '';
    }
  }

  if (addTaskOpenButton) {
    addTaskOpenButton.addEventListener('click', () => {
      openAddTaskModal();
    });
  }

  if (addTaskCloseButtons.length) {
    addTaskCloseButtons.forEach((button) => {
      button.addEventListener('click', () => {
        closeAddTaskModal();
      });
    });
  }

  if (editTaskCloseButtons.length) {
    editTaskCloseButtons.forEach((button) => {
      button.addEventListener('click', () => {
        closeEditTaskModal();
      });
    });
  }

  if (editSubtaskOpenButton) {
    editSubtaskOpenButton.addEventListener('click', () => {
      showEditSubtaskForm(true);
      if (editSubtaskInput) {
        editSubtaskInput.focus();
      }
    });
  }

  if (editSubtaskCancelButton) {
    editSubtaskCancelButton.addEventListener('click', () => {
      showEditSubtaskForm(false);
    });
  }

  if (addTaskModal) {
    addTaskModal.addEventListener('click', (event) => {
      if (event.target === addTaskModal) {
        closeAddTaskModal();
      }
    });
  }

  if (editTaskModal) {
    editTaskModal.addEventListener('click', (event) => {
      if (event.target === editTaskModal) {
        closeEditTaskModal();
      }
    });
  }

  if (calendarAgendaModal) {
    calendarAgendaModal.addEventListener('click', (event) => {
      if (event.target === calendarAgendaModal) {
        closeCalendarAgendaModal();
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && addTaskModal && !addTaskModal.hidden) {
      closeAddTaskModal();
      return;
    }

    if (event.key === 'Escape' && editTaskModal && !editTaskModal.hidden) {
      closeEditTaskModal();
      return;
    }

    if (event.key === 'Escape' && calendarAgendaModal) {
      closeCalendarAgendaModal();
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const trigger = target.closest('[data-open-edit-task-modal="true"]');
    if (!trigger) {
      return;
    }

    if (shouldIgnoreEditTrigger(target)) {
      return;
    }

    event.preventDefault();
    openEditTaskModal(trigger);
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const trigger = target.closest('[data-open-edit-task-modal="true"]');
    if (!trigger) {
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    if (shouldIgnoreEditTrigger(target)) {
      return;
    }

    event.preventDefault();
    openEditTaskModal(trigger);
  });

  if (addSubtaskRowButton && subtaskList) {
    addSubtaskRowButton.addEventListener('click', () => {
      const inputs = subtaskList.querySelectorAll('[data-subtask-input]');
      if (inputs.length >= 20) {
        return;
      }

      subtaskList.appendChild(createSubtaskRow());
      const latestInput = subtaskList.lastElementChild && subtaskList.lastElementChild.querySelector('[data-subtask-input]');
      if (latestInput) {
        latestInput.focus();
      }
    });

    subtaskList.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const removeButton = target.closest('[data-remove-subtask]');
      if (!removeButton) {
        return;
      }

      const row = removeButton.closest('.task-subtask-row');
      if (!row) {
        return;
      }

      const rows = subtaskList.querySelectorAll('.task-subtask-row');
      if (rows.length <= 1) {
        const input = row.querySelector('[data-subtask-input]');
        if (input) {
          input.value = '';
          input.focus();
        }
        return;
      }

      row.remove();
    });
  }

  if (addTaskForm) {
    addTaskForm.addEventListener('submit', () => {
      if (deadlineHiddenInput && taskDateInput) {
        const datePart = typeof taskDateInput.value === 'string' ? taskDateInput.value : '';
        const timePart = taskTimeInput && typeof taskTimeInput.value === 'string' && taskTimeInput.value
          ? taskTimeInput.value
          : '09:00';
        deadlineHiddenInput.value = datePart ? `${datePart}T${timePart}` : '';
      }

      if (subtasksJsonInput) {
        subtasksJsonInput.value = JSON.stringify(collectSubtasks());
      }
    });

  }

  if (editSubtaskForm) {
    editSubtaskForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (!activeEditTodoId || !editSubtaskInput) {
        return;
      }

      const text = typeof editSubtaskInput.value === 'string' ? editSubtaskInput.value.trim() : '';
      if (!text) {
        editSubtaskInput.focus();
        return;
      }

      const { csrfToken, returnTo } = getEditModalMeta();
      const params = new URLSearchParams();
      params.set('_csrf', csrfToken);
      params.set('returnTo', returnTo);
      params.set('text', text);

      try {
        const payload = await submitSubtaskModalRequest(`/todos/${activeEditTodoId}/subtasks`, params);

        if (payload.subtask) {
          activeEditSubtasks.push({
            id: payload.subtask.id,
            text: payload.subtask.text,
            completed: Boolean(payload.subtask.completed)
          });
          renderEditSubtasks();
        }

        editSubtaskInput.value = '';
        editSubtaskInput.focus();
      } catch (error) {
        window.alert(error.message || 'Unable to add subtask right now.');
      }
    });
  }

  if (editSubtaskList) {
    editSubtaskList.addEventListener('change', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      const subtaskId = Number.parseInt(target.getAttribute('data-edit-subtask-toggle') || '', 10);
      if (Number.isNaN(subtaskId) || !activeEditTodoId) {
        return;
      }

      const previousChecked = !target.checked;
      const { csrfToken, returnTo } = getEditModalMeta();
      const params = new URLSearchParams();
      params.set('_csrf', csrfToken);
      params.set('returnTo', returnTo);

      try {
        await submitSubtaskModalRequest(`/todos/${activeEditTodoId}/subtasks/${subtaskId}/toggle?_method=PATCH`, params);
        activeEditSubtasks = activeEditSubtasks.map((subtask) => (
          Number(subtask.id) === subtaskId
            ? { ...subtask, completed: target.checked }
            : subtask
        ));
        renderEditSubtasks();
      } catch (error) {
        target.checked = previousChecked;
        window.alert(error.message || 'Unable to update subtask right now.');
      }
    });

    editSubtaskList.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const deleteButton = target.closest('[data-edit-subtask-delete]');
      if (!deleteButton || !activeEditTodoId) {
        return;
      }

      const subtaskId = Number.parseInt(deleteButton.getAttribute('data-edit-subtask-delete') || '', 10);
      if (Number.isNaN(subtaskId)) {
        return;
      }

      const { csrfToken, returnTo } = getEditModalMeta();
      const params = new URLSearchParams();
      params.set('_csrf', csrfToken);
      params.set('returnTo', returnTo);

      try {
        await submitSubtaskModalRequest(`/todos/${activeEditTodoId}/subtasks/${subtaskId}?_method=DELETE`, params);
        activeEditSubtasks = activeEditSubtasks.filter((subtask) => Number(subtask.id) !== subtaskId);
        renderEditSubtasks();
      } catch (error) {
        window.alert(error.message || 'Unable to delete subtask right now.');
      }
    });
  }

  resetAddTaskForm({ resetNativeForm: false });
});