import { router } from './router.js';
import { api } from './api.js';
import { renderIntegrations } from './components/integrations.js';
import { renderSources } from './components/sources.js';
import { renderTagsManager } from './components/tags-manager.js';
import { renderQueries, cleanupQueries } from './components/queries.js';
import { renderAI } from './components/ai.js';
import { renderContent } from './components/content.js';
import { renderOutputs } from './components/outputs.js';

// Check authentication on app load
async function checkAuthentication() {
  const token = localStorage.getItem('auth_token');
  
  // If no token, redirect to login
  if (!token) {
    window.location.href = '/login.html';
    return false;
  }

  // Verify token is still valid
  try {
    const response = await fetch('/api/auth/verify', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await response.json();
    
    if (!data.valid) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_username');
      window.location.href = '/login.html';
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Auth verification failed:', error);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_username');
    window.location.href = '/login.html';
    return false;
  }
}

// Logout function
function logout() {
  if (confirm('Are you sure you want to log out?')) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_username');
    window.location.href = '/login.html';
  }
}

// Initialize logout button
function initializeLogoutButton() {
  const headerControlsDiv = document.querySelector('.header-controls');
  if (!headerControlsDiv) return;

  // Create logout button
  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'logout-btn';
  logoutBtn.setAttribute('aria-label', 'Logout');
  logoutBtn.title = 'Logout';
  logoutBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
      <polyline points="16 17 21 12 16 7"></polyline>
      <line x1="21" y1="12" x2="9" y2="12"></line>
    </svg>
  `;
  logoutBtn.addEventListener('click', logout);
  
  // Add to header controls after theme toggle
  headerControlsDiv.appendChild(logoutBtn);
}

// Register routes
router.register('/integrations', renderIntegrations);
router.register('/sources', renderSources);
router.register('/tags', renderTagsManager);
router.register('/queries', renderQueries, cleanupQueries);
router.register('/ai', renderAI);
router.register('/content', renderContent);
router.register('/outputs', renderOutputs);

// Credit Balance Management
let creditRefreshInterval = null;

async function updateCreditBalance() {
  const creditBalanceEl = document.getElementById('credit-balance');
  if (!creditBalanceEl) return;

  try {
    creditBalanceEl.classList.add('loading');
    const data = await api.getOpenRouterCredits();
    
    const balance = data.balance;
    const formattedBalance = balance.toFixed(2);
    
    // Update the display
    creditBalanceEl.textContent = `$${formattedBalance}`;
    creditBalanceEl.classList.remove('loading', 'error');
    
    // Apply color classes based on balance
    creditBalanceEl.classList.remove('balance-healthy', 'balance-warning', 'balance-critical');
    if (balance >= 5) {
      creditBalanceEl.classList.add('balance-healthy');
    } else if (balance >= 1) {
      creditBalanceEl.classList.add('balance-warning');
    } else {
      creditBalanceEl.classList.add('balance-critical');
    }
    
    // Update tooltip with full details
    creditBalanceEl.title = `Total Credits: $${data.total_credits.toFixed(2)}\nTotal Usage: $${data.total_usage.toFixed(2)}\nRemaining: $${formattedBalance}`;
  } catch (error) {
    console.error('Failed to fetch credit balance:', error);
    creditBalanceEl.textContent = 'Error';
    creditBalanceEl.classList.remove('loading');
    creditBalanceEl.classList.add('error');
    creditBalanceEl.title = 'Failed to load credit balance';
  }
}

function initializeCreditBalance() {
  const userActionsDiv = document.querySelector('.user-actions');
  if (!userActionsDiv) return;

  // Create credit balance display
  const creditContainer = document.createElement('div');
  creditContainer.className = 'credit-balance-container';
  creditContainer.innerHTML = `
    <i data-feather="dollar-sign" class="credit-icon"></i>
    <span id="credit-balance" class="credit-balance">Loading...</span>
  `;
  
  userActionsDiv.appendChild(creditContainer);
  
  // Initialize feather icons for the new icon
  if (typeof feather !== 'undefined') {
    feather.replace();
  }
  
  // Initial load
  updateCreditBalance();
  
  // Set up periodic refresh every 60 seconds (respects OpenRouter's cache window)
  if (creditRefreshInterval) {
    clearInterval(creditRefreshInterval);
  }
  creditRefreshInterval = setInterval(updateCreditBalance, 60000);
}

// Listen for custom events to refresh credit balance after AI operations
document.addEventListener('ai-operation-complete', () => {
  console.log('AI operation complete, refreshing credit balance...');
  updateCreditBalance();
});

// Initialize app on page load
document.addEventListener('DOMContentLoaded', async () => {
  // Check authentication first
  const isAuthenticated = await checkAuthentication();
  if (!isAuthenticated) {
    return; // Will redirect to login
  }
  
  // Initialize UI components
  initializeLogoutButton();
  initializeCreditBalance();
});

// Export for use in other components
window.refreshCreditBalance = updateCreditBalance;

console.log('Palimpsest app initialized');
