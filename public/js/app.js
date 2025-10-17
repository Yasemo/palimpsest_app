import { router } from './router.js';
import { api } from './api.js';
import { renderIntegrations } from './components/integrations.js';
import { renderSources } from './components/sources.js';
import { renderQueries, cleanupQueries } from './components/queries.js';
import { renderAI } from './components/ai.js';
import { renderContent } from './components/content.js';
import { renderOutputs } from './components/outputs.js';

// Register routes
router.register('/integrations', renderIntegrations);
router.register('/sources', renderSources);
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

// Initialize credit balance on page load
document.addEventListener('DOMContentLoaded', () => {
  initializeCreditBalance();
});

// Export for use in other components
window.refreshCreditBalance = updateCreditBalance;

console.log('Palimpsest app initialized');
