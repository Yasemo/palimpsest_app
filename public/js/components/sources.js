import { api } from '../api.js';
import { showLoading, hideLoading, showNotification } from '../router.js';
import Modal, { confirm } from './modal.js';

let currentSources = [];

export async function renderSources() {
  const container = document.getElementById('app-content');
  
  container.innerHTML = `
    <div class="page-header">
      <h2>Sources</h2>
      <p>Configure external data sources for gathering information</p>
      <button class="btn-primary" id="create-source-btn">+ Create Source</button>
    </div>
    
    <div id="sources-list" class="sources-grid">
      <div class="loading-text">Loading sources...</div>
    </div>
  `;

  document.getElementById('create-source-btn').addEventListener('click', () => showSourceTypeModal());
  
  await loadSources();
}

async function loadSources() {
  try {
    showLoading();
    currentSources = await api.getSources();
    hideLoading();
    renderSourcesList();
  } catch (error) {
    hideLoading();
    showNotification('Failed to load sources: ' + error.message, 'error');
  }
}

function renderSourcesList() {
  const container = document.getElementById('sources-list');
  
  if (currentSources.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No sources configured yet</p>
        <p class="text-muted">Create your first source to start gathering information</p>
      </div>
    `;
    return;
  }

  container.innerHTML = currentSources.map(source => {
    const config = typeof source.config === 'string' ? JSON.parse(source.config) : source.config;
    const statusClass = source.last_execution_status === 'success' ? 'success' : 
                       source.last_execution_status === 'error' ? 'error' : 'pending';
    
    return `
      <div class="source-card card">
        <div class="card-header">
          <div>
            <h3>${escapeHtml(source.name)}</h3>
            <span class="badge ${source.active ? 'badge-success' : 'badge-secondary'}">
              ${source.active ? 'Active' : 'Inactive'}
            </span>
            ${source.last_execution_status ? `
              <span class="badge badge-${statusClass}">
                ${source.last_execution_status}
              </span>
            ` : ''}
          </div>
        </div>
        
        <div class="card-body">
          <div class="source-info">
            <div class="info-row">
              <span class="label">Type:</span>
              <span class="value">${source.type}</span>
            </div>
            <div class="info-row">
              <span class="label">Model:</span>
              <span class="value">${config.model || 'sonar-pro'}</span>
            </div>
            ${source.last_executed_at ? `
              <div class="info-row">
                <span class="label">Last Run:</span>
                <span class="value">${formatDate(source.last_executed_at)}</span>
              </div>
            ` : ''}
          </div>
          
          <div class="source-prompt">
            <strong>Prompt:</strong>
            <p class="prompt-text">${escapeHtml(config.prompt || 'N/A')}</p>
          </div>
        </div>
        
        <div class="card-actions">
          <button class="btn-sm btn-primary" onclick="window.executeSource(${source.id})">
            Execute
          </button>
          <button class="btn-sm" onclick="window.viewSourceResults(${source.id})">
            View Results
          </button>
          <button class="btn-sm" onclick="window.editSource(${source.id})">
            Edit
          </button>
          <button class="btn-sm btn-danger" onclick="window.deleteSource(${source.id})">
            Delete
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function showSourceTypeModal() {
  const modal = new Modal();
  modal.create({
    title: 'Select Source Type',
    size: 'medium',
    content: `
      <div class="source-types-container">
        <p class="text-muted" style="margin-bottom: 1.5rem;">
          Choose the type of data source you want to create
        </p>
        
        <div class="source-type-cards">
          <div class="source-type-card" data-type="perplexity">
            <div class="source-type-icon"><i data-feather="search"></i></div>
            <h4>Perplexity</h4>
            <p>AI-powered web search for gathering current information and research</p>
            <button class="btn-primary btn-sm" onclick="window.selectSourceType('perplexity')">
              Select
            </button>
          </div>
          
          <div class="source-type-card disabled">
            <div class="source-type-icon"><i data-feather="rss"></i></div>
            <h4>RSS Feed</h4>
            <p>Monitor RSS feeds for updates and new content</p>
            <span class="badge badge-secondary">Coming Soon</span>
          </div>
          
          <div class="source-type-card disabled">
            <div class="source-type-icon"><i data-feather="twitter"></i></div>
            <h4>Social Media</h4>
            <p>Track mentions and hashtags on social platforms</p>
            <span class="badge badge-secondary">Coming Soon</span>
          </div>
          
          <div class="source-type-card disabled">
            <div class="source-type-icon"><i data-feather="radio"></i></div>
            <h4>News API</h4>
            <p>Access news articles from various sources worldwide</p>
            <span class="badge badge-secondary">Coming Soon</span>
          </div>
        </div>
      </div>
    `,
    actions: [
      {
        id: 'cancel',
        label: 'Cancel',
        className: 'btn-secondary',
        onClick: (m) => m.close()
      }
    ]
  });
  
  // Store modal reference for closing from selectSourceType
  window.currentTypeModal = modal;
}

window.selectSourceType = (type) => {
  if (window.currentTypeModal) {
    window.currentTypeModal.close();
  }
  
  // For now, only Perplexity is supported
  if (type === 'perplexity') {
    showPerplexityConfigModal(null);
  }
};

function showPerplexityConfigModal(source = null) {
  const isEdit = !!source;
  const config = source && typeof source.config === 'string' ? JSON.parse(source.config) : (source?.config || {});
  
  const modal = new Modal();
  modal.create({
    title: isEdit ? 'Edit Source' : 'Create Source',
    size: 'large',
    content: `
      <form id="source-form" class="form">
        <div class="form-group">
          <label for="source-name">Source Name *</label>
          <input 
            type="text" 
            id="source-name" 
            name="name" 
            class="form-control"
            value="${escapeHtml(source?.name || '')}"
            required
            placeholder="e.g., Daily News Monitor"
          >
        </div>
        
        <div class="form-group">
          <label for="source-prompt">Search Prompt *</label>
          <textarea 
            id="source-prompt" 
            name="prompt" 
            class="form-control"
            rows="4"
            required
            placeholder="What information should this source gather? Be specific..."
          >${escapeHtml(config.prompt || '')}</textarea>
          <small class="form-text">Describe what information you want to search for</small>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label for="source-model">Model</label>
            <select id="source-model" name="model" class="form-control">
              <option value="sonar-pro" ${config.model === 'sonar-pro' || !config.model ? 'selected' : ''}>
                Sonar Pro (Recommended)
              </option>
              <option value="sonar" ${config.model === 'sonar' ? 'selected' : ''}>
                Sonar
              </option>
            </select>
            <small class="form-text">Perplexity model to use</small>
          </div>
          
          <div class="form-group">
            <label for="source-max-tokens">Max Tokens</label>
            <input 
              type="number" 
              id="source-max-tokens" 
              name="max_tokens" 
              class="form-control"
              value="${config.max_tokens || 4096}"
              min="100"
              max="8000"
            >
            <small class="form-text">Maximum response length</small>
          </div>
        </div>
        
        <div class="form-group">
          <label for="source-temperature">
            Temperature: <span id="temp-value">${config.temperature || 0.2}</span>
          </label>
          <input 
            type="range" 
            id="source-temperature" 
            name="temperature" 
            class="form-control-range"
            min="0"
            max="1"
            step="0.1"
            value="${config.temperature || 0.2}"
          >
          <small class="form-text">Lower = more focused, Higher = more creative</small>
        </div>
        
        <div class="form-group">
          <label class="checkbox-label">
            <input 
              type="checkbox" 
              id="source-active" 
              name="active"
              ${source?.active !== false ? 'checked' : ''}
            >
            Active
          </label>
          <small class="form-text">Inactive sources won't run on schedule</small>
        </div>
      </form>
    `,
    actions: [
      {
        id: 'cancel',
        label: 'Cancel',
        className: 'btn-secondary',
        onClick: (m) => m.close()
      },
      {
        id: 'save',
        label: isEdit ? 'Save Changes' : 'Create Source',
        className: 'btn-primary',
        onClick: async (m) => {
          const form = document.getElementById('source-form');
          if (!form.checkValidity()) {
            form.reportValidity();
            return;
          }
          
          const formData = m.getFormData();
          await saveSource(formData, source?.id, m);
        }
      }
    ]
  });
  
  // Update temperature display
  const tempSlider = document.getElementById('source-temperature');
  const tempValue = document.getElementById('temp-value');
  tempSlider.addEventListener('input', (e) => {
    tempValue.textContent = e.target.value;
  });
}

async function saveSource(formData, sourceId, modal) {
  try {
    modal.setLoading(true);
    
    const sourceData = {
      name: formData.name,
      type: 'perplexity',
      config: {
        prompt: formData.prompt,
        model: formData.model,
        temperature: parseFloat(formData.temperature),
        max_tokens: parseInt(formData.max_tokens)
      },
      schedule: null,
      active: formData.active
    };
    
    if (sourceId) {
      await api.updateSource(sourceId, sourceData);
      showNotification('Source updated successfully', 'success');
    } else {
      await api.createSource(sourceData);
      showNotification('Source created successfully', 'success');
    }
    
    modal.close();
    await loadSources();
  } catch (error) {
    modal.setLoading(false);
    showNotification('Failed to save source: ' + error.message, 'error');
  }
}

function showSourceModal(source = null) {
  // When editing, go directly to config (only Perplexity for now)
  showPerplexityConfigModal(source);
}

window.editSource = (id) => {
  const source = currentSources.find(s => s.id === id);
  if (source) {
    showSourceModal(source);
  }
};

window.executeSource = async (id) => {
  try {
    showLoading();
    await api.executeSource(id);
    hideLoading();
    showNotification('Source executed successfully', 'success');
    await loadSources();
  } catch (error) {
    hideLoading();
    showNotification('Failed to execute source: ' + error.message, 'error');
  }
};

window.viewSourceResults = async (id) => {
  const source = currentSources.find(s => s.id === id);
  if (!source) return;
  
  try {
    showLoading();
    const results = await api.getSourceResults(id);
    hideLoading();
    showResultsModal(source, results);
  } catch (error) {
    hideLoading();
    showNotification('Failed to load results: ' + error.message, 'error');
  }
};

function showResultsModal(source, results) {
  const modal = new Modal();
  modal.create({
    title: `Results: ${source.name}`,
    size: 'large',
    content: `
      <div class="results-container">
        ${results.length === 0 ? `
          <div class="empty-state">
            <p>No execution results yet</p>
            <p class="text-muted">Execute this source to see results here</p>
          </div>
        ` : `
          <div class="results-list">
            ${results.map(result => {
              const data = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
              return `
                <div class="result-item ${result.status}">
                  <div class="result-header">
                    <span class="badge badge-${result.status === 'success' ? 'success' : 'error'}">
                      ${result.status}
                    </span>
                    <span class="result-date">${formatDate(result.executed_at)}</span>
                  </div>
                  
                  ${result.status === 'error' ? `
                    <div class="result-error">
                      <strong>Error:</strong> ${escapeHtml(result.error_message || data.error || 'Unknown error')}
                    </div>
                  ` : `
                    <div class="result-content">
                      <div class="result-meta">
                        <span>Model: ${data.model || 'N/A'}</span>
                        ${data.usage ? `
                          <span>Tokens: ${data.usage.total_tokens || 'N/A'}</span>
                        ` : ''}
                      </div>
                      <div class="result-text">
                        ${escapeHtml(data.content || 'No content')}
                      </div>
                      ${data.citations && data.citations.length > 0 ? `
                        <div class="result-citations">
                          <strong>Sources:</strong>
                          <ul class="citations-list">
                            ${data.citations.map((citation, idx) => `
                              <li>
                                <a href="${escapeHtml(citation)}" target="_blank" rel="noopener noreferrer">
                                  [${idx + 1}] ${escapeHtml(citation)}
                                </a>
                              </li>
                            `).join('')}
                          </ul>
                        </div>
                      ` : ''}
                    </div>
                  `}
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `,
    actions: [
      {
        id: 'close',
        label: 'Close',
        className: 'btn-primary',
        onClick: (m) => m.close()
      }
    ]
  });
}

window.deleteSource = async (id) => {
  const confirmed = await confirm(
    'Are you sure you want to delete this source? This will also delete all associated results.',
    'Delete Source'
  );
  
  if (!confirmed) return;
  
  try {
    showLoading();
    await api.deleteSource(id);
    hideLoading();
    showNotification('Source deleted successfully', 'success');
    await loadSources();
  } catch (error) {
    hideLoading();
    showNotification('Failed to delete source: ' + error.message, 'error');
  }
};

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}
