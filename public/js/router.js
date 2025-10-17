// Simple hash-based router
class Router {
  constructor() {
    this.routes = new Map();
    this.cleanupHandlers = new Map();
    this.currentRoute = null;
    
    window.addEventListener('hashchange', () => this.handleRoute());
    window.addEventListener('load', () => this.handleRoute());
  }

  register(path, handler, cleanupHandler = null) {
    this.routes.set(path, handler);
    if (cleanupHandler) {
      this.cleanupHandlers.set(path, cleanupHandler);
    }
  }

  handleRoute() {
    const hash = window.location.hash.slice(1) || '/integrations';
    const [route] = hash.split('?');
    
    // Call cleanup handler for previous route
    if (this.currentRoute && this.cleanupHandlers.has(this.currentRoute)) {
      const cleanupHandler = this.cleanupHandlers.get(this.currentRoute);
      cleanupHandler();
    }
    
    // Update active tab
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.remove('active');
      if (tab.getAttribute('href') === `#${route}`) {
        tab.classList.add('active');
      }
    });

    // Find and execute route handler
    const handler = this.routes.get(route);
    if (handler) {
      this.currentRoute = route;
      handler();
    } else {
      // Default route
      window.location.hash = '/integrations';
    }
  }

  navigate(path) {
    window.location.hash = path;
  }
}

export const router = new Router();

// Utility functions for showing/hiding loading and modals
export function showLoading() {
  document.getElementById('loading-overlay').style.display = 'flex';
}

export function hideLoading() {
  document.getElementById('loading-overlay').style.display = 'none';
}

export function showModal(title, content) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = content;
  document.getElementById('modal-overlay').style.display = 'flex';
}

export function hideModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.getElementById('modal-body').innerHTML = '';
}

// Close modal when clicking overlay or close button
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay' || e.target.id === 'modal-close') {
    hideModal();
  }
});

export function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

export function showNotificationWithAction(message, type = 'info', buttonText, buttonAction) {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type} notification-with-action`;
  
  const messageSpan = document.createElement('span');
  messageSpan.textContent = message;
  
  const button = document.createElement('button');
  button.className = 'notification-btn';
  button.textContent = buttonText;
  button.onclick = () => {
    buttonAction();
    notification.remove();
  };
  
  notification.appendChild(messageSpan);
  notification.appendChild(button);
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  // Auto-dismiss after 10 seconds (longer than regular notifications)
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 10000);
}
