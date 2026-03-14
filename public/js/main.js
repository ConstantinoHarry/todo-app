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

  if (addTaskModal) {
    addTaskModal.addEventListener('click', (event) => {
      if (event.target === addTaskModal) {
        closeAddTaskModal();
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && addTaskModal && !addTaskModal.hidden) {
      closeAddTaskModal();
    }
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

  resetAddTaskForm({ resetNativeForm: false });
});