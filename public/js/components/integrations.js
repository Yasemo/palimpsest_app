import { api } from '../api.js';
import { showLoading, hideLoading, showNotification } from '../router.js';

export async function renderIntegrations() {
  const container = document.getElementById('app-content');
  
  container.innerHTML = `
    <div class="page-header">
      <h2>Integrations</h2>
      <p>Manage third-party service connections</p>
    </div>
    <div class="integrations-status" id="integrations-status">
      <div class="loading-text">Loading integration status...</div>
    </div>
  `;

  try {
    showLoading();
    const status = await api.getIntegrationStatus();
    hideLoading();

    const statusHtml = `
      <div class="integration-cards">
        <div class="integration-card ${status.perplexity ? 'connected' : 'disconnected'}">
          <h3>Perplexity</h3>
          <p>AI-powered web search integration</p>
          <div class="status-indicator">
            <span class="status-dot"></span>
            ${status.perplexity ? 'Connected' : 'Not Configured'}
          </div>
          <p class="config-note">Configure via environment variables</p>
        </div>

        <div class="integration-card ${status.openrouter ? 'connected' : 'disconnected'}">
          <h3>OpenRouter</h3>
          <p>Access to multiple LLM providers</p>
          <div class="status-indicator">
            <span class="status-dot"></span>
            ${status.openrouter ? 'Connected' : 'Not Configured'}
          </div>
          <p class="config-note">Configure via environment variables</p>
        </div>

        <div class="integration-card ${status.gmail ? 'connected' : 'disconnected'}">
          <h3>Gmail</h3>
          <p>Email draft creation and sending</p>
          <div class="status-indicator">
            <span class="status-dot"></span>
            ${status.gmail ? 'Connected' : 'Not Configured'}
          </div>
          <p class="config-note">Configure via environment variables</p>
        </div>
      </div>

      <div class="integration-info">
        <h3>Configuration</h3>
        <p>Integrations are configured via environment variables in your .env file:</p>
        <ul>
          <li><code>PERPLEXITY_API_KEY</code> - Your Perplexity API key</li>
          <li><code>OPENROUTER_API_KEY</code> - Your OpenRouter API key</li>
          <li><code>GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_USER_EMAIL</code> - Gmail OAuth credentials</li>
        </ul>
      </div>
    `;

    document.getElementById('integrations-status').innerHTML = statusHtml;
  } catch (error) {
    hideLoading();
    showNotification('Failed to load integration status: ' + error.message, 'error');
    document.getElementById('integrations-status').innerHTML = `
      <div class="error-message">Failed to load integration status</div>
    `;
  }
}
