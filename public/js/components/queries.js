import { api } from '../api.js';
import { showLoading, hideLoading, showNotification } from '../router.js';
import Modal, { confirm } from './modal.js';

let currentQueries = [];
let currentSources = [];
let currentInfoPackages = [];

export async function renderQueries() {
  const container = document.getElementById('app-content');
  
  container.innerHTML = `
    <div class="page-header">
      <h2>Queries</h2>
      <p>Create batch queries to execute multiple sources and generate info packages</p>
      <button class="btn-primary" id="create-query-btn">+ Create Query Batch</button>
    </div>

    <!-- Queries List Section -->
    <div class="section-header">
      <h3>Query Batches</h3>
      <p class="text-muted">Configured query batches with scheduled source execution</p>
    </div>
    <div id="queries-list" class="queries-grid">
      <div class="loading-text">Loading queries...</div>
    </div>

    <!-- Recent Info Packages Section -->
    <div class="section-header" style="margin-top: 2rem;">
      <h3>Recent Info Packages</h3>
      <p class="text-muted">Latest information packages generated from query executions</p>
    </div>
    <div id="recent-packages" class="info-packages-grid">
      <div class="loading-text">Loading recent packages...</div>
    </div>

    <!-- All Info Packages Section -->
    <div class="section-header" style="margin-top: 2rem;">
      <h3>All Info Packages</h3>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <p class="text-muted">Complete history of generated info packages</p>
        <div style="display: flex; gap: 0.5rem;">
          <button id="prev-page" class="btn-sm" disabled>← Previous</button>
          <span id="page-info" class="text-muted">Page 1</span>
          <button id="next-page" class="btn-sm">Next →</button>
        </div>
      </div>
    </div>
    <div id="all-packages" class="info-packages-list">
      <div class="loading-text">Loading all packages...</div>
    </div>
  `;

  document.getElementById('create-query-btn').addEventListener('click', () => showQueryModal());
  
  await Promise.all([
    loadSources(),
    loadQueries(),
    loadRecentInfoPackages(),
    loadAllInfoPackages(0)
  ]);

  setupPagination();
}

async function loadSources() {
  try {
    currentSources = await api.getSources();
  } catch (error) {
    showNotification('Failed to load sources: ' + error.message, 'error');
  }
}

async function loadQueries() {
  try {
    showLoading();
    currentQueries = await api.getQueries();
    hideLoading();
    renderQueriesList();
  } catch (error) {
    hideLoading();
    showNotification('Failed to load queries: ' + error.message, 'error');
  }
}

async function loadRecentInfoPackages() {
  try {
    const packages = await api.getAllInfoPackages(5, 0);
    currentInfoPackages = packages;
    renderRecentPackages(packages);
  } catch (error) {
    document.getElementById('recent-packages').innerHTML = 
      '<div class="empty-state">Failed to load recent packages</div>';
  }
}

let currentPage = 0;
const packagesPerPage = 10;

async function loadAllInfoPackages(offset) {
  try {
    const packages = await api.getAllInfoPackages(packagesPerPage, offset);
    renderAllPackages(packages);
    
    // Update pagination buttons
    document.getElementById('prev-page').disabled = offset === 0;
    document.getElementById('next-page').disabled = packages.length < packagesPerPage;
    document.getElementById('page-info').textContent = `Page ${Math.floor(offset / packagesPerPage) + 1}`;
  } catch (error) {
    document.getElementById('all-packages').innerHTML = 
      '<div class="empty-state">Failed to load packages</div>';
  }
}

function setupPagination() {
  document.getElementById('prev-page').addEventListener('click', () => {
    if (currentPage > 0) {
      currentPage--;
      loadAllInfoPackages(currentPage * packagesPerPage);
    }
  });

  document.getElementById('next-page').addEventListener('click', () => {
    currentPage++;
    loadAllInfoPackages(currentPage * packagesPerPage);
  });
}

function renderQueriesList() {
  const container = document.getElementById('queries-list');
  
  if (currentQueries.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No query batches configured yet</p>
        <p class="text-muted">Create your first query batch to start generating info packages</p>
      </div>
    `;
    return;
  }

  container.innerHTML = currentQueries.map(query => {
    const config = typeof query.query_config === 'string' 
      ? JSON.parse(query.query_config) 
      : query.query_config;
    
    const sourcesCount = config.sources?.length || 0;
    const schedule = config.schedule || {};
    const scheduleText = formatSchedule(schedule);

    return `
      <div class="card query-card">
        <div class="card-header">
          <div>
            <h3>${escapeHtml(query.name)}</h3>
            <span class="badge ${query.active ? 'badge-success' : 'badge-secondary'}">
              ${query.active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
        
        <div class="card-body">
          <div class="query-info">
            <div class="info-row">
              <span class="label">Sources:</span>
              <span class="value">${sourcesCount} source${sourcesCount !== 1 ? 's' : ''}</span>
            </div>
            <div class="info-row">
              <span class="label">Schedule:</span>
              <span class="value">${scheduleText}</span>
            </div>
            <div class="info-row">
              <span class="label">Instructions:</span>
              <span class="value query-directive">${escapeHtml(query.directive)}</span>
            </div>
          </div>
        </div>
        
        <div class="card-actions">
          <button class="btn-sm btn-primary" onclick="window.executeQueryBatch(${query.id})">
            Execute Now
          </button>
          <button class="btn-sm" onclick="window.viewQueryPackages(${query.id})">
            View Packages
          </button>
          <button class="btn-sm" onclick="window.editQueryBatch(${query.id})">
            Edit
          </button>
          <button class="btn-sm btn-danger" onclick="window.deleteQueryBatch(${query.id})">
            Delete
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderRecentPackages(packages) {
  const container = document.getElementById('recent-packages');
  
  if (packages.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No info packages generated yet</p>
        <p class="text-muted">Execute a query batch to generate info packages</p>
      </div>
    `;
    return;
  }

  container.innerHTML = packages.map(pkg => {
    const data = typeof pkg.data === 'string' ? JSON.parse(pkg.data) : pkg.data;
    const summary = data.executionSummary || {};
    
    return `
      <div class="card info-package-card">
        <div class="card-header">
          <h4>${escapeHtml(pkg.query_name || 'Unknown Query')}</h4>
          <span class="badge ${pkg.processed ? 'badge-success' : 'badge-secondary'}">
            ${pkg.processed ? 'Processed' : 'Pending'}
          </span>
        </div>
        
        <div class="card-body">
          <div class="package-summary">
            <div class="summary-item">
              <span class="label">Created:</span>
              <span class="value">${formatDate(pkg.created_at)}</span>
            </div>
            <div class="summary-item">
              <span class="label">Sources:</span>
              <span class="value">${summary.totalSources || 0} total</span>
            </div>
            <div class="summary-item">
              <span class="label">Success:</span>
              <span class="value">${summary.successCount || 0}</span>
            </div>
            ${summary.errorCount > 0 ? `
              <div class="summary-item">
                <span class="label">Errors:</span>
                <span class="value text-error">${summary.errorCount}</span>
              </div>
            ` : ''}
          </div>
        </div>
        
        <div class="card-actions">
          <button class="btn-sm btn-primary" onclick="window.viewPackageDetails(${pkg.id})">
            View Details
          </button>
          ${!pkg.processed ? `
            <button class="btn-sm" onclick="window.processPackage(${pkg.id})">
              Process with AI
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderAllPackages(packages) {
  const container = document.getElementById('all-packages');
  
  if (packages.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No info packages found</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="packages-table">
      <thead>
        <tr>
          <th>Query</th>
          <th>Created</th>
          <th>Sources</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${packages.map(pkg => {
          const data = typeof pkg.data === 'string' ? JSON.parse(pkg.data) : pkg.data;
          const summary = data.executionSummary || {};
          
          return `
            <tr>
              <td><strong>${escapeHtml(pkg.query_name || 'Unknown')}</strong></td>
              <td>${formatDate(pkg.created_at)}</td>
              <td>
                ${summary.successCount || 0}/${summary.totalSources || 0}
                ${summary.errorCount > 0 ? `<span class="text-error">(${summary.errorCount} errors)</span>` : ''}
              </td>
              <td>
                <span class="badge ${pkg.processed ? 'badge-success' : 'badge-secondary'}">
                  ${pkg.processed ? 'Processed' : 'Pending'}
                </span>
              </td>
              <td>
                <button class="btn-sm" onclick="window.viewPackageDetails(${pkg.id})">View</button>
                <button class="btn-sm btn-danger" onclick="window.deletePackage(${pkg.id})">Delete</button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function showQueryModal(query = null) {
  const isEdit = !!query;
  const config = query && typeof query.query_config === 'string' 
    ? JSON.parse(query.query_config) 
    : (query?.query_config || { sources: [], schedule: {} });
  
  const schedule = config.schedule || {};
  
  const modal = new Modal();
  modal.create({
    title: isEdit ? 'Edit Query Batch' : 'Create Query Batch',
    size: 'large',
    content: `
      <form id="query-form" class="form">
        <div class="form-section">
          <h4>Basic Information</h4>
          
          <div class="form-group">
            <label for="query-name">Batch Title *</label>
            <input 
              type="text" 
              id="query-name" 
              name="name" 
              class="form-control"
              value="${escapeHtml(query?.name || '')}"
              required
              placeholder="e.g., Daily Canadian News Roundup"
            >
          </div>
          
          <div class="form-group">
            <label for="query-directive">Instructions / Directive *</label>
            <textarea 
              id="query-directive" 
              name="directive" 
              class="form-control"
              rows="4"
              required
              placeholder="What should be done with this information? Be specific about the expected output..."
            >${escapeHtml(query?.directive || '')}</textarea>
            <small class="form-text">These instructions will be included in every info package</small>
          </div>
        </div>

        <div class="form-section">
          <h4>Source Selection *</h4>
          <p class="text-muted">Select which sources to include in this batch</p>
          
          <div id="sources-selection" class="sources-selection">
            ${currentSources.length === 0 ? `
              <div class="empty-state">
                <p>No sources available</p>
                <p class="text-muted">Create sources first before creating a query batch</p>
              </div>
            ` : currentSources.map(source => {
              const sourceConfig = typeof source.config === 'string' 
                ? JSON.parse(source.config) 
                : source.config;
              const isSelected = config.sources?.includes(source.id);
              
              return `
                <div class="source-checkbox-card">
                  <label class="checkbox-label">
                    <input 
                      type="checkbox" 
                      name="sources" 
                      value="${source.id}"
                      ${isSelected ? 'checked' : ''}
                    >
                    <div class="source-checkbox-content">
                      <div class="source-checkbox-header">
                        <strong>${escapeHtml(source.name)}</strong>
                        <span class="badge badge-info">${source.type}</span>
                      </div>
                      <p class="source-checkbox-prompt">${escapeHtml(sourceConfig.prompt || 'No prompt')}</p>
                    </div>
                  </label>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="form-section">
          <h4>Schedule Configuration</h4>
          
          <div class="form-row">
            <div class="form-group">
              <label for="schedule-time">Time of Day</label>
              <input 
                type="time" 
                id="schedule-time" 
                name="scheduleTime" 
                class="form-control"
                value="${schedule.time || '17:00'}"
              >
              <small class="form-text">When should this batch execute?</small>
            </div>
            
            <div class="form-group">
              <label for="interval-type">Interval Type</label>
              <select id="interval-type" name="intervalType" class="form-control">
                <option value="hourly" ${schedule.intervalType === 'hourly' ? 'selected' : ''}>Hourly</option>
                <option value="daily" ${!schedule.intervalType || schedule.intervalType === 'daily' ? 'selected' : ''}>Daily</option>
                <option value="weekly" ${schedule.intervalType === 'weekly' ? 'selected' : ''}>Weekly</option>
                <option value="monthly" ${schedule.intervalType === 'monthly' ? 'selected' : ''}>Monthly</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="interval-value">Every</label>
              <input 
                type="number" 
                id="interval-value" 
                name="intervalValue" 
                class="form-control"
                min="1"
                max="365"
                value="${schedule.intervalValue || 1}"
              >
              <small class="form-text">e.g., Every 2 days</small>
            </div>
          </div>
          
          <div class="form-group">
            <label for="end-date">End Date (Optional)</label>
            <input 
              type="date" 
              id="end-date" 
              name="endDate" 
              class="form-control"
              value="${schedule.endDate || ''}"
            >
            <small class="form-text">Leave empty for no end date</small>
          </div>

          <div class="schedule-preview">
            <strong>Schedule Preview:</strong> <span id="schedule-preview-text">Every day at 5:00 PM</span>
          </div>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input 
              type="checkbox" 
              id="query-active" 
              name="active"
              ${query?.active !== false ? 'checked' : ''}
            >
            Active
          </label>
          <small class="form-text">Inactive query batches won't run on schedule</small>
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
        label: isEdit ? 'Save Changes' : 'Create Query Batch',
        className: 'btn-primary',
        onClick: async (m) => {
          const form = document.getElementById('query-form');
          if (!form.checkValidity()) {
            form.reportValidity();
            return;
          }
          
          // Check if at least one source is selected
          const selectedSources = Array.from(form.querySelectorAll('input[name="sources"]:checked'));
          if (selectedSources.length === 0) {
            showNotification('Please select at least one source', 'error');
            return;
          }
          
          const formData = m.getFormData();
          await saveQuery(formData, query?.id, m);
        }
      }
    ]
  });

  // Update schedule preview dynamically
  updateSchedulePreview();
  ['schedule-time', 'interval-type', 'interval-value', 'end-date'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', updateSchedulePreview);
  });
}

function updateSchedulePreview() {
  const time = document.getElementById('schedule-time')?.value || '17:00';
  const intervalType = document.getElementById('interval-type')?.value || 'daily';
  const intervalValue = parseInt(document.getElementById('interval-value')?.value) || 1;
  const endDate = document.getElementById('end-date')?.value;

  const schedule = {
    time,
    intervalType,
    intervalValue,
    endDate: endDate || null
  };

  const previewText = formatSchedule(schedule);
  const previewElement = document.getElementById('schedule-preview-text');
  if (previewElement) {
    previewElement.textContent = previewText;
  }
}

function formatSchedule(schedule) {
  if (!schedule || !schedule.time) return 'No schedule configured';

  const time = formatTime(schedule.time);
  const intervalType = schedule.intervalType || 'daily';
  const intervalValue = schedule.intervalValue || 1;
  const endDate = schedule.endDate;

  let text = '';
  
  if (intervalType === 'hourly') {
    text = intervalValue === 1 
      ? 'Every hour' 
      : `Every ${intervalValue} hours`;
  } else if (intervalType === 'daily') {
    text = intervalValue === 1 
      ? `Every day at ${time}` 
      : `Every ${intervalValue} days at ${time}`;
  } else if (intervalType === 'weekly') {
    text = intervalValue === 1 
      ? `Every week at ${time}` 
      : `Every ${intervalValue} weeks at ${time}`;
  } else if (intervalType === 'monthly') {
    text = intervalValue === 1 
      ? `Every month at ${time}` 
      : `Every ${intervalValue} months at ${time}`;
  }

  if (endDate) {
    text += ` until ${new Date(endDate).toLocaleDateString()}`;
  }

  return text;
}

function formatTime(time24) {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

function generateCronExpression(schedule) {
  if (!schedule || !schedule.time) return null;
  
  const [hours, minutes] = schedule.time.split(':');
  const intervalType = schedule.intervalType || 'daily';
  const intervalValue = schedule.intervalValue || 1;
  
  // Cron format: minute hour day month dayOfWeek
  
  if (intervalType === 'hourly') {
    // Run every X hours
    return `${minutes} */${intervalValue} * * *`;
  } else if (intervalType === 'daily') {
    // Run every X days at specified time
    if (intervalValue === 1) {
      return `${minutes} ${hours} * * *`;
    } else {
      // For multi-day intervals, use day of month pattern (approximation)
      return `${minutes} ${hours} */${intervalValue} * *`;
    }
  } else if (intervalType === 'weekly') {
    // Run every X weeks on Sunday at specified time
    if (intervalValue === 1) {
      return `${minutes} ${hours} * * 0`;
    } else {
      // Multi-week approximation (every 7*X days)
      return `${minutes} ${hours} */${7 * intervalValue} * *`;
    }
  } else if (intervalType === 'monthly') {
    // Run on first day of every X months at specified time
    if (intervalValue === 1) {
      return `${minutes} ${hours} 1 * *`;
    } else {
      return `${minutes} ${hours} 1 */${intervalValue} *`;
    }
  }
  
  // Default: daily at specified time
  return `${minutes} ${hours} * * *`;
}

function calculateNextRunAt(schedule, fromTime = new Date()) {
  if (!schedule || !schedule.time) return null;
  
  const { time, intervalType, intervalValue, endDate } = schedule;
  const [hours, minutes] = time.split(':');
  
  let nextRun = new Date(fromTime);
  nextRun.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  
  // For hourly intervals, if the time has passed, calculate next occurrence
  if (intervalType === 'hourly') {
    // If the scheduled time hasn't occurred yet today, use it
    // Otherwise, add intervals until we get a future time
    while (nextRun <= fromTime) {
      nextRun.setHours(nextRun.getHours() + parseInt(intervalValue));
    }
  } else {
    // For daily/weekly/monthly, if time already passed today, move to next occurrence
    if (nextRun <= fromTime) {
      if (intervalType === 'daily') {
        nextRun.setDate(nextRun.getDate() + parseInt(intervalValue));
      } else if (intervalType === 'weekly') {
        nextRun.setDate(nextRun.getDate() + (7 * parseInt(intervalValue)));
      } else if (intervalType === 'monthly') {
        nextRun.setMonth(nextRun.getMonth() + parseInt(intervalValue));
      }
    }
  }
  
  // Check if next run is beyond end date
  if (endDate) {
    const endDateTime = new Date(endDate);
    endDateTime.setHours(23, 59, 59, 999); // End of the end date
    if (nextRun > endDateTime) {
      return null; // Schedule has ended
    }
  }
  
  return nextRun.toISOString();
}

async function saveQuery(formData, queryId, modal) {
  try {
    modal.setLoading(true);
    
    // Get selected sources
    const form = document.getElementById('query-form');
    const selectedSources = Array.from(form.querySelectorAll('input[name="sources"]:checked'))
      .map(input => parseInt(input.value));

    // Build schedule config
    const scheduleConfig = {
      time: formData.scheduleTime,
      intervalType: formData.intervalType,
      intervalValue: parseInt(formData.intervalValue),
      endDate: formData.endDate || null
    };

    // Generate cron expression from schedule config
    const cronExpression = generateCronExpression(scheduleConfig);
    
    // Calculate next run time
    const nextRunAt = calculateNextRunAt(scheduleConfig);

    const queryData = {
      name: formData.name,
      directive: formData.directive,
      query_config: {
        sources: selectedSources,
        schedule: scheduleConfig
      },
      schedule: cronExpression,
      next_run_at: nextRunAt,
      active: formData.active
    };
    
    if (queryId) {
      await api.updateQuery(queryId, queryData);
      showNotification('Query batch updated successfully', 'success');
    } else {
      await api.createQuery(queryData);
      showNotification('Query batch created successfully', 'success');
    }
    
    modal.close();
    await loadQueries();
  } catch (error) {
    modal.setLoading(false);
    showNotification('Failed to save query: ' + error.message, 'error');
  }
}

window.executeQueryBatch = async (id) => {
  try {
    const query = currentQueries.find(q => q.id === id);
    if (!query) return;

    const config = typeof query.query_config === 'string' 
      ? JSON.parse(query.query_config) 
      : query.query_config;
    
    const sourceIds = config.sources || [];
    const sourcesCount = sourceIds.length;

    // Get source details
    const sources = sourceIds.map(sourceId => 
      currentSources.find(s => s.id === sourceId)
    ).filter(s => s);

    // Show execution progress modal
    const progressModal = new Modal();
    progressModal.create({
      title: 'Executing Query Batch',
      size: 'medium',
      closeOnBackdrop: false,
      content: `
        <div class="execution-progress">
          <p><strong>${escapeHtml(query.name)}</strong></p>
          <p class="text-muted">Executing ${sourcesCount} source${sourcesCount !== 1 ? 's' : ''} sequentially...</p>
          <div class="progress-bar">
            <div class="progress-fill" style="width: 0%"></div>
          </div>
          <div id="execution-status" class="execution-status">
            ${sources.map((source, index) => `
              <div class="source-execution-item" id="source-${source.id}">
                <span class="execution-icon">⏱️</span>
                <span class="source-name">${index + 1}. ${escapeHtml(source.name)}</span>
                <span class="execution-status-text">Waiting...</span>
              </div>
            `).join('')}
          </div>
        </div>
      `,
      actions: []
    });

    const sourceResults = [];
    
    // Execute each source sequentially with visual feedback
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      const statusItem = progressModal.modalElement.querySelector(`#source-${source.id}`);
      const progressFill = progressModal.modalElement.querySelector('.progress-fill');
      
      // Update to "executing" status
      if (statusItem) {
        statusItem.querySelector('.execution-icon').textContent = '⏳';
        statusItem.querySelector('.execution-status-text').textContent = 'Executing...';
        statusItem.style.fontWeight = 'bold';
      }
      
      try {
        // Execute the source
        const result = await api.executeSource(source.id);
        
        // Update to "success" status
        if (statusItem) {
          statusItem.querySelector('.execution-icon').textContent = '✓';
          statusItem.querySelector('.execution-status-text').textContent = 'Complete';
          statusItem.style.color = 'var(--success)';
          statusItem.style.fontWeight = 'normal';
        }
        
        sourceResults.push({
          sourceId: source.id,
          sourceName: source.name,
          sourceType: source.type,
          result: result,
          status: 'success',
          executedAt: new Date().toISOString()
        });
        
      } catch (error) {
        // Update to "error" status
        if (statusItem) {
          statusItem.querySelector('.execution-icon').textContent = '✗';
          statusItem.querySelector('.execution-status-text').textContent = 'Failed';
          statusItem.style.color = 'var(--error)';
          statusItem.style.fontWeight = 'normal';
        }
        
        sourceResults.push({
          sourceId: source.id,
          sourceName: source.name,
          sourceType: source.type,
          result: { error: error.message },
          status: 'error',
          executedAt: new Date().toISOString()
        });
      }
      
      // Update progress bar
      if (progressFill) {
        const progress = ((i + 1) / sources.length) * 100;
        progressFill.style.width = `${progress}%`;
      }
    }
    
    // Create info package with the executed results
    const packageData = {
      sources: sourceResults,
      queryTitle: query.name,
      executionSummary: {
        totalSources: sources.length,
        successCount: sourceResults.filter(r => r.status === 'success').length,
        errorCount: sourceResults.filter(r => r.status === 'error').length,
      }
    };
    
    try {
      const infoPackage = await api.request('/api/info-packages', {
        method: 'POST',
        body: JSON.stringify({
          query_id: id,
          data: packageData,
          directive: query.directive
        })
      });
      
      // Refresh the packages lists
      await Promise.all([
        loadRecentInfoPackages(),
        loadAllInfoPackages(currentPage * packagesPerPage)
      ]);
      
      // Update modal actions with success message
      progressModal.modalElement.querySelector('.modal-actions').innerHTML = `
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
        <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove(); window.viewPackageDetails(${infoPackage.id})">View Info Package</button>
      `;
      
      showNotification('Info package created successfully!', 'success');
    } catch (error) {
      // If package creation fails, still allow closing the modal
      progressModal.modalElement.querySelector('.modal-actions').innerHTML = `
        <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Close</button>
      `;
      showNotification('Sources executed but failed to create info package: ' + error.message, 'error');
    }

  } catch (error) {
    showNotification('Failed to execute query: ' + error.message, 'error');
  }
};

window.editQueryBatch = (id) => {
  const query = currentQueries.find(q => q.id === id);
  if (query) {
    showQueryModal(query);
  }
};

window.deleteQueryBatch = async (id) => {
  const confirmed = await confirm(
    'Are you sure you want to delete this query batch? This will not delete the generated info packages.',
    'Delete Query Batch'
  );
  
  if (!confirmed) return;
  
  try {
    showLoading();
    await api.deleteQuery(id);
    hideLoading();
    showNotification('Query batch deleted successfully', 'success');
    await loadQueries();
  } catch (error) {
    hideLoading();
    showNotification('Failed to delete query: ' + error.message, 'error');
  }
};

window.viewQueryPackages = async (id) => {
  try {
    showLoading();
    const packages = await api.getInfoPackages(id);
    hideLoading();
    
    const query = currentQueries.find(q => q.id === id);
    
    const modal = new Modal();
    modal.create({
      title: `Info Packages: ${query?.name || 'Query'}`,
      size: 'large',
      content: `
        <div class="packages-modal-content">
          ${packages.length === 0 ? `
            <div class="empty-state">
              <p>No info packages generated yet</p>
              <p class="text-muted">Execute this query batch to generate info packages</p>
            </div>
          ` : `
            <div class="packages-list">
              ${packages.map(pkg => {
                const data = typeof pkg.data === 'string' ? JSON.parse(pkg.data) : pkg.data;
                const summary = data.executionSummary || {};
                
                return `
                  <div class="package-item">
                    <div class="package-header">
                      <span>${formatDate(pkg.created_at)}</span>
                      <span class="badge ${pkg.processed ? 'badge-success' : 'badge-secondary'}">
                        ${pkg.processed ? 'Processed' : 'Pending'}
                      </span>
                    </div>
                    <div class="package-stats">
                      <span>Sources: ${summary.totalSources || 0}</span>
                      <span>Success: ${summary.successCount || 0}</span>
                      ${summary.errorCount > 0 ? `<span class="text-error">Errors: ${summary.errorCount}</span>` : ''}
                    </div>
                    <button class="btn-sm" onclick="window.viewPackageDetails(${pkg.id})">View Details</button>
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
  } catch (error) {
    hideLoading();
    showNotification('Failed to load packages: ' + error.message, 'error');
  }
};

window.viewPackageDetails = async (id) => {
  try {
    showLoading();
    const pkg = await api.getInfoPackage(id);
    hideLoading();
    
    const data = typeof pkg.data === 'string' ? JSON.parse(pkg.data) : pkg.data;
    const sources = data.sources || [];
    
    const modal = new Modal();
    modal.create({
      title: 'Info Package Details',
      size: 'large',
      content: `
        <div class="package-details">
          <div class="detail-section">
            <h4>Query Information</h4>
            <div class="info-grid">
              <div class="info-item">
                <span class="label">Query:</span>
                <span class="value">${escapeHtml(pkg.query_name || 'Unknown')}</span>
              </div>
              <div class="info-item">
                <span class="label">Created:</span>
                <span class="value">${formatDate(pkg.created_at)}</span>
              </div>
              <div class="info-item">
                <span class="label">Status:</span>
                <span class="badge ${pkg.processed ? 'badge-success' : 'badge-secondary'}">
                  ${pkg.processed ? 'Processed' : 'Pending'}
                </span>
              </div>
            </div>
          </div>

          <div class="detail-section">
            <h4>Directive</h4>
            <div class="directive-text">${escapeHtml(pkg.directive)}</div>
          </div>

          <div class="detail-section">
            <h4>Source Results (${sources.length})</h4>
            <div class="sources-results">
              ${sources.map((source, index) => {
                const resultData = source.result?.data || source.result;
                const content = resultData?.content || 'No content available';
                
                return `
                  <div class="source-result ${source.status}">
                    <div class="source-result-header">
                      <div>
                        <strong>${index + 1}. ${escapeHtml(source.sourceName)}</strong>
                        <span class="badge badge-info">${source.sourceType}</span>
                      </div>
                      <span class="badge ${source.status === 'success' ? 'badge-success' : 'badge-error'}">
                        ${source.status}
                      </span>
                    </div>
                    <div class="source-result-content">
                      ${source.status === 'success' ? `
                        <p>${escapeHtml(content).substring(0, 500)}${content.length > 500 ? '...' : ''}</p>
                      ` : `
                        <p class="text-error">Error: ${escapeHtml(resultData?.error || 'Unknown error')}</p>
                      `}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `,
      actions: [
        {
          id: 'close',
          label: 'Close',
          className: 'btn-secondary',
          onClick: (m) => m.close()
        },
        {
          id: 'edit',
          label: 'Edit Directive',
          className: 'btn-primary',
          onClick: (m) => {
            m.close();
            window.editPackageDirective(id, pkg.directive);
          }
        },
        {
          id: 'delete',
          label: 'Delete Package',
          className: 'btn-danger',
          onClick: async (m) => {
            const confirmed = await confirm('Are you sure you want to delete this info package?');
            if (confirmed) {
              m.close();
              await window.deletePackage(id);
            }
          }
        }
      ]
    });
  } catch (error) {
    hideLoading();
    showNotification('Failed to load package details: ' + error.message, 'error');
  }
};

window.deletePackage = async (id) => {
  try {
    showLoading();
    await api.deleteInfoPackage(id);
    hideLoading();
    showNotification('Info package deleted successfully', 'success');
    await Promise.all([
      loadRecentInfoPackages(),
      loadAllInfoPackages(currentPage * packagesPerPage)
    ]);
  } catch (error) {
    hideLoading();
    showNotification('Failed to delete package: ' + error.message, 'error');
  }
};

window.editPackageDirective = (id, currentDirective) => {
  const modal = new Modal();
  modal.create({
    title: 'Edit Info Package Directive',
    size: 'medium',
    content: `
      <form id="directive-form" class="form">
        <div class="form-group">
          <label for="package-directive">Directive / Instructions *</label>
          <textarea 
            id="package-directive" 
            name="directive" 
            class="form-control"
            rows="8"
            required
            placeholder="What should be done with this information?"
          >${escapeHtml(currentDirective)}</textarea>
          <small class="form-text">Update the instructions for how this information should be processed or used</small>
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
        label: 'Save Changes',
        className: 'btn-primary',
        onClick: async (m) => {
          const form = document.getElementById('directive-form');
          if (!form.checkValidity()) {
            form.reportValidity();
            return;
          }
          
          const formData = m.getFormData();
          await savePackageDirective(id, formData.directive, m);
        }
      }
    ]
  });
};

async function savePackageDirective(id, directive, modal) {
  try {
    modal.setLoading(true);
    
    await api.updateInfoPackage(id, { directive });
    
    showNotification('Directive updated successfully', 'success');
    modal.close();
    
    // Refresh package lists
    await Promise.all([
      loadRecentInfoPackages(),
      loadAllInfoPackages(currentPage * packagesPerPage)
    ]);
    
    // Reopen the package details with updated data
    await window.viewPackageDetails(id);
  } catch (error) {
    modal.setLoading(false);
    showNotification('Failed to update directive: ' + error.message, 'error');
  }
}

window.processPackage = async (id) => {
  try {
    showLoading();
    await api.processInfoPackage(id);
    hideLoading();
    showNotification('Info package sent for AI processing', 'success');
    await loadRecentInfoPackages();
  } catch (error) {
    hideLoading();
    showNotification('Failed to process package: ' + error.message, 'error');
  }
};

function escapeHtml(text) {
  if (!text) return '';
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
