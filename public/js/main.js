document.addEventListener('DOMContentLoaded', () => {
  const clearCompletedForm = document.querySelector('[data-clear-completed-form]');
  const focusModeToggle = document.getElementById('focusModeToggle');
  const focusPanel = document.querySelector('.focus-panel');

  if (clearCompletedForm) {
    clearCompletedForm.addEventListener('submit', (event) => {
      const confirmed = window.confirm('Archive and remove all completed tasks for today?');

      if (!confirmed) {
        event.preventDefault();
      }
    });
  }

  function updateFocusPanelState() {
    if (!focusPanel || !focusModeToggle) {
      return;
    }

    focusPanel.classList.toggle('focus-active', focusModeToggle.checked);
  }

  if (focusModeToggle) {
    focusModeToggle.addEventListener('change', updateFocusPanelState);
    updateFocusPanelState();
  }
});
