// Modal Component System

export class Modal {
  constructor() {
    this.modalElement = null;
    this.onSubmitCallback = null;
    this.onCloseCallback = null;
  }

  create(config) {
    const {
      title,
      content,
      actions = [],
      size = 'medium', // small, medium, large
      closeOnBackdrop = true
    } = config;

    // Remove any existing modal
    this.destroy();

    // Create modal HTML
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-container modal-${size}">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="modal-content">
          ${content}
        </div>
        <div class="modal-actions">
          ${actions.map(action => `
            <button 
              class="btn ${action.className || ''}" 
              data-action="${action.id}"
              ${action.disabled ? 'disabled' : ''}
            >
              ${action.label}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    // Add to DOM
    document.body.appendChild(modal);
    this.modalElement = modal;

    // Setup event listeners
    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => this.close());

    if (closeOnBackdrop) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.close();
        }
      });
    }

    // Handle action buttons
    actions.forEach(action => {
      const btn = modal.querySelector(`[data-action="${action.id}"]`);
      if (btn && action.onClick) {
        btn.addEventListener('click', () => action.onClick(this));
      }
    });

    // Show modal with animation
    setTimeout(() => modal.classList.add('modal-visible'), 10);

    // Focus first input if exists
    const firstInput = modal.querySelector('input, textarea, select');
    if (firstInput) {
      firstInput.focus();
    }

    return this;
  }

  close() {
    if (this.modalElement) {
      this.modalElement.classList.remove('modal-visible');
      setTimeout(() => {
        this.destroy();
        if (this.onCloseCallback) {
          this.onCloseCallback();
        }
      }, 200);
    }
  }

  destroy() {
    if (this.modalElement) {
      this.modalElement.remove();
      this.modalElement = null;
    }
  }

  onClose(callback) {
    this.onCloseCallback = callback;
    return this;
  }

  getFormData() {
    if (!this.modalElement) return null;
    
    const form = this.modalElement.querySelector('form');
    if (!form) return null;

    const formData = new FormData(form);
    const data = {};
    for (const [key, value] of formData.entries()) {
      // Handle checkboxes
      const input = form.querySelector(`[name="${key}"]`);
      if (input && input.type === 'checkbox') {
        data[key] = input.checked;
      } else if (input && input.type === 'number') {
        data[key] = parseFloat(value) || 0;
      } else {
        data[key] = value;
      }
    }
    return data;
  }

  setLoading(isLoading) {
    if (!this.modalElement) return;
    
    const buttons = this.modalElement.querySelectorAll('.modal-actions button');
    buttons.forEach(btn => {
      btn.disabled = isLoading;
    });

    if (isLoading) {
      this.modalElement.classList.add('modal-loading');
    } else {
      this.modalElement.classList.remove('modal-loading');
    }
  }
}

// Helper function to create a confirmation dialog
export function confirm(message, title = 'Confirm') {
  return new Promise((resolve) => {
    const modal = new Modal();
    modal.create({
      title,
      content: `<p>${message}</p>`,
      actions: [
        {
          id: 'cancel',
          label: 'Cancel',
          className: 'btn-secondary',
          onClick: (m) => {
            m.close();
            resolve(false);
          }
        },
        {
          id: 'confirm',
          label: 'Confirm',
          className: 'btn-primary',
          onClick: (m) => {
            m.close();
            resolve(true);
          }
        }
      ]
    });
  });
}

// Helper function to create an alert dialog
export function alert(message, title = 'Alert') {
  return new Promise((resolve) => {
    const modal = new Modal();
    modal.create({
      title,
      content: `<p>${message}</p>`,
      actions: [
        {
          id: 'ok',
          label: 'OK',
          className: 'btn-primary',
          onClick: (m) => {
            m.close();
            resolve(true);
          }
        }
      ]
    });
  });
}

export default Modal;
