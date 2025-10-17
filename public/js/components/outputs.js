import { api } from '../api.js';
import { showLoading, hideLoading, showNotification } from '../router.js';
import Modal from './modal.js';

export async function renderOutputs() {
  const container = document.getElementById('app-content');
  
  container.innerHTML = `
    <div class="page-header">
      <h2>Outputs</h2>
      <p>Schedule content delivery to external services</p>
      <button class="btn-primary" onclick="window.createOutput()">+ Create Output</button>
    </div>
    <div id="outputs-list" class="outputs-list">
      <div class="loading-text">Loading outputs...</div>
    </div>
  `;

  window.createOutput = () => showCreateOutputModal();

  loadOutputs();
}

async function showCreateOutputModal() {
  // Reset recipients array
  recipients = [];
  
  try {
    // Load all available tags
    const tags = await api.getTags();
    
    const modal = new Modal();
    modal.create({
      title: 'Create Output',
      size: 'large',
      content: `
        <form id="create-output-form" class="form-grid">
          <div class="form-group">
            <label for="output-name">Name *</label>
            <input type="text" id="output-name" name="name" required placeholder="e.g., Weekly Newsletter">
          </div>

          <div class="form-group">
            <label for="output-type">Integration Type *</label>
            <select id="output-type" name="type" required>
              <option value="gmail">Gmail</option>
            </select>
          </div>

          <div class="form-section">
            <h4>Content Filtering</h4>
            
            <div class="form-group">
              <label>Select Tags (content must have at least one of these tags)</label>
              <div id="tags-selector" class="tags-selector">
                ${tags.length > 0 ? tags.map(tag => `
                  <label class="checkbox-label">
                    <input type="checkbox" name="tag" value="${tag.id}" onchange="window.updateContentPreview()">
                    <span class="tag-badge" style="background-color: ${tag.color}">${tag.name}</span>
                  </label>
                `).join('') : '<p class="text-muted">No tags available. Create tags first.</p>'}
              </div>
            </div>

            <div class="form-group">
              <label for="cutoff-date">Date Cutoff *</label>
              <select id="cutoff-date" name="cutoff_days" required onchange="window.updateContentPreview()">
                <option value="1">Last day (24 hours)</option>
                <option value="7" selected>Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="-1">All time</option>
              </select>
            </div>

            <div class="form-group">
              <div id="content-preview-section" class="content-preview-section">
                <div class="preview-header">
                  <strong>Content Preview</strong>
                  <span id="content-count-badge" class="badge badge-secondary">0 items</span>
                </div>
                <div id="content-preview-list" class="content-preview-list">
                  <p class="text-muted" style="text-align: center; padding: 2rem;">
                    Select tags and date cutoff to preview content
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div class="form-section">
            <h4>Gmail Settings</h4>
            
            <div class="form-group">
              <label>Recipient Emails *</label>
              <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
                <input type="email" id="recipient-input" placeholder="email@example.com" style="flex: 1;">
                <button type="button" class="btn-sm" onclick="window.addRecipient()">Add Email</button>
              </div>
              <div id="recipients-list" style="display: flex; flex-wrap: wrap; gap: 0.5rem; min-height: 42px; padding: 0.5rem; border: 1px solid var(--border-light); border-radius: 2px; background: var(--bg-secondary);">
                <span class="text-muted" style="font-size: 0.875rem;">No recipients added yet</span>
              </div>
              <small class="text-muted">Add one or more email addresses to send the output to</small>
            </div>

            <div class="form-group">
              <label for="subject">Email Subject *</label>
              <input type="text" id="subject" name="subject" required placeholder="Your Content Digest">
            </div>

            <div class="form-group">
              <label for="gmail-labels">Gmail Labels (comma-separated)</label>
              <input type="text" id="gmail-labels" name="labels" placeholder="label1, label2">
              <small class="text-muted">Labels will be created if they don't exist. "Palimpsest App" label is always added automatically.</small>
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
                  value="17:00"
                >
                <small class="text-muted">When should this output execute?</small>
              </div>
              
              <div class="form-group">
                <label for="interval-type">Interval Type</label>
                <select id="interval-type" name="intervalType" class="form-control">
                  <option value="hourly">Hourly</option>
                  <option value="daily" selected>Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
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
                  value="1"
                >
                <small class="text-muted">e.g., Every 2 days</small>
              </div>
            </div>
            
            <div class="form-group">
              <label for="end-date">End Date (Optional)</label>
              <input 
                type="date" 
                id="end-date" 
                name="endDate" 
                class="form-control"
              >
              <small class="text-muted">Leave empty for no end date</small>
            </div>

            <div class="schedule-preview">
              <strong>Schedule Preview:</strong> <span id="schedule-preview-text">Every day at 5:00 PM</span>
            </div>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="active" name="active" checked>
              <span>Active</span>
            </label>
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
          id: 'create',
          label: 'Create Output',
          className: 'btn-primary',
          onClick: async (m) => {
            console.log('[Outputs] Create button clicked');
            
            const form = document.getElementById('create-output-form');
            if (!form.checkValidity()) {
              console.log('[Outputs] Form validation failed');
              form.reportValidity();
              return;
            }

            console.log('[Outputs] Form is valid, collecting data...');
            const formData = m.getFormData();
            console.log('[Outputs] Raw form data:', formData);
            
            // Get selected tags
            const selectedTags = Array.from(document.querySelectorAll('#tags-selector input[name="tag"]:checked'))
              .map(input => parseInt(input.value));
            console.log('[Outputs] Selected tags:', selectedTags);

            // Check if at least one recipient is added
            if (recipients.length === 0) {
              showNotification('Please add at least one recipient email', 'error');
              return;
            }
            console.log('[Outputs] Recipients:', recipients);

            // Parse labels
            const labelsInput = formData.labels || '';
            const labels = labelsInput.split(',').map(l => l.trim()).filter(l => l.length > 0);
            console.log('[Outputs] Parsed Gmail labels:', labels);

            // Build schedule config
            const scheduleConfig = {
              time: formData.scheduleTime,
              intervalType: formData.intervalType,
              intervalValue: parseInt(formData.intervalValue),
              endDate: formData.endDate || null
            };
            console.log('[Outputs] Schedule config:', scheduleConfig);

            // Generate cron expression from schedule config
            const cronExpression = generateCronExpression(scheduleConfig);
            console.log('[Outputs] Generated cron expression:', cronExpression);

            const outputData = {
              name: formData.name,
              type: formData.type,
              config: {
                recipients: recipients,  // Array of email addresses
                subject: formData.subject,
                labels: labels,
                cutoff_days: parseInt(formData.cutoff_days),
                content_separator: '\n\n---\n\n',
                include_metadata: true,
                content_type: 'text/plain',
                schedule_config: scheduleConfig  // Save schedule config for display
              },
              schedule: cronExpression,
              active: formData.active
            };
            console.log('[Outputs] Complete output data to send:', outputData);

            m.setLoading(true);
            
            try {
              console.log('[Outputs] Calling API to create output...');
              const output = await api.createOutput(outputData);
              console.log('[Outputs] Output created successfully:', output);
              
              // Set tags for the output
              if (selectedTags.length > 0) {
                console.log('[Outputs] Setting tags for output...');
                await api.setOutputTags(output.id, selectedTags);
                console.log('[Outputs] Tags set successfully');
              } else {
                console.log('[Outputs] No tags selected, skipping tag assignment');
              }
              
              console.log('[Outputs] Closing modal and refreshing list');
              m.close();
              showNotification('Output created successfully', 'success');
              loadOutputs();
            } catch (error) {
              console.error('[Outputs] Error creating output:', error);
              m.setLoading(false);
              showNotification('Failed to create output: ' + error.message, 'error');
            }
          }
        }
      ]
    });

    // Update schedule preview dynamically
    updateSchedulePreview();
    ['schedule-time', 'interval-type', 'interval-value', 'end-date'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', updateSchedulePreview);
    });
  } catch (error) {
    showNotification('Failed to load tags: ' + error.message, 'error');
  }
}

async function loadOutputs() {
  try {
    showLoading();
    const outputs = await api.getOutputs();
    hideLoading();

    const container = document.getElementById('outputs-list');
    if (outputs.length === 0) {
      container.innerHTML = '<div class="empty-state">No outputs yet. Create your first output!</div>';
      return;
    }

    // Load tags for each output
    const outputsWithTags = await Promise.all(
      outputs.map(async (output) => {
        const tags = await api.getOutputTags(output.id);
        return { ...output, tags };
      })
    );

    container.innerHTML = outputsWithTags.map(output => {
      // Get schedule display text
      const scheduleText = output.config.schedule_config 
        ? formatSchedule(output.config.schedule_config)
        : (output.schedule ? 'Scheduled (legacy format)' : 'Manual only');
      
      return `
      <div class="card output-card">
        <div class="card-header">
          <div>
            <h3>${output.name}</h3>
            <div class="tags-list">
              ${output.tags.map(tag => `
                <span class="tag-badge" style="background-color: ${tag.color}">${tag.name}</span>
              `).join('')}
            </div>
          </div>
          <span class="badge ${output.active ? 'badge-success' : 'badge-secondary'}">
            ${output.active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div class="card-body">
          <p><strong>Type:</strong> ${output.type}</p>
          <p><strong>Recipients:</strong> ${output.config.recipients ? output.config.recipients.join(', ') : (output.config.recipient || 'N/A')}</p>
          <p><strong>Subject:</strong> ${output.config.subject || 'N/A'}</p>
          ${output.config.labels && output.config.labels.length > 0 ? 
            `<p><strong>Gmail Labels:</strong> ${output.config.labels.join(', ')}</p>` : ''}
          <p><strong>Date Cutoff:</strong> ${getCutoffLabel(output.config.cutoff_days)}</p>
          <p><strong>Schedule:</strong> ${scheduleText}</p>
        </div>
        <div class="card-actions">
          <button class="btn-sm" onclick="window.executeOutput(${output.id})">Execute Now</button>
          <button class="btn-sm" onclick="window.viewOutputLogs(${output.id})">View History</button>
          <button class="btn-sm" onclick="window.editOutput(${output.id})">Edit</button>
          <button class="btn-sm btn-danger" onclick="window.deleteOutput(${output.id})">Delete</button>
        </div>
      </div>
    `;
    }).join('');
  } catch (error) {
    hideLoading();
    showNotification('Failed to load outputs: ' + error.message, 'error');
  }
}

function getCutoffLabel(days) {
  if (days === -1) return 'All time';
  if (days === 1) return 'Last day';
  if (days === 7) return 'Last 7 days';
  if (days === 30) return 'Last 30 days';
  if (days === 90) return 'Last 90 days';
  return `Last ${days} days`;
}

window.executeOutput = async (id) => {
  try {
    showLoading();
    const result = await api.executeOutput(id);
    hideLoading();
    showNotification(`Output executed! Processed ${result.contentCount} content items.`, 'success');
    
    // Optionally refresh logs if viewing them
    if (window.currentViewingOutputId === id) {
      viewOutputLogs(id);
    }
  } catch (error) {
    hideLoading();
    showNotification('Failed to execute output: ' + error.message, 'error');
  }
};

window.viewOutputLogs = async (id) => {
  window.currentViewingOutputId = id;
  
  try {
    showLoading();
    const logs = await api.getOutputLogs(id);
    const output = await api.getOutput(id);
    hideLoading();

    const modal = new Modal();
    modal.create({
      title: `Execution History - ${output.name}`,
      size: 'large',
      content: `
        <div class="logs-container">
          ${logs.length === 0 ? 
            '<p class="text-muted">No execution history yet.</p>' :
            logs.map(log => `
              <div class="log-entry">
                <div class="log-header">
                  <strong>${new Date(log.executed_at).toLocaleString()}</strong>
                  <span class="badge ${log.status === 'success' ? 'badge-success' : 'badge-danger'}">
                    ${log.status}
                  </span>
                </div>
                <div class="log-body">
                  <p><strong>Content Items:</strong> ${log.content_ids.length}</p>
                  ${log.output_content ? `
                    <details>
                      <summary>View Combined Output Content</summary>
                      <pre class="output-content-preview">${escapeHtml(log.output_content.substring(0, 2000))}${log.output_content.length > 2000 ? '...' : ''}</pre>
                    </details>
                  ` : ''}
                </div>
              </div>
            `).join('')
          }
        </div>
      `,
      actions: [
        {
          id: 'close',
          label: 'Close',
          className: 'btn-primary',
          onClick: (m) => {
            window.currentViewingOutputId = null;
            m.close();
          }
        }
      ]
    });
  } catch (error) {
    hideLoading();
    showNotification('Failed to load logs: ' + error.message, 'error');
  }
};

window.editOutput = async (id) => {
  try {
    showLoading();
    const output = await api.getOutput(id);
    const outputTags = await api.getOutputTags(id);
    const allTags = await api.getTags();
    hideLoading();

    // Set recipients from output config
    recipients = output.config.recipients || (output.config.recipient ? [output.config.recipient] : []);
    
    const scheduleConfig = output.config.schedule_config || { time: '17:00', intervalType: 'daily', intervalValue: 1, endDate: null };
    
    const modal = new Modal();
    modal.create({
      title: 'Edit Output',
      size: 'large',
      content: `
        <form id="edit-output-form" class="form-grid">
          <div class="form-group">
            <label for="output-name">Name *</label>
            <input type="text" id="output-name" name="name" required value="${escapeHtml(output.name)}">
          </div>

          <div class="form-group">
            <label for="output-type">Integration Type *</label>
            <select id="output-type" name="type" required>
              <option value="gmail" ${output.type === 'gmail' ? 'selected' : ''}>Gmail</option>
            </select>
          </div>

          <div class="form-section">
            <h4>Content Filtering</h4>
            
            <div class="form-group">
              <label>Select Tags (content must have at least one of these tags)</label>
              <div id="tags-selector" class="tags-selector">
                ${allTags.length > 0 ? allTags.map(tag => {
                  const isChecked = outputTags.some(t => t.id === tag.id);
                  return `
                    <label class="checkbox-label">
                      <input type="checkbox" name="tag" value="${tag.id}" ${isChecked ? 'checked' : ''} onchange="window.updateContentPreview()">
                      <span class="tag-badge" style="background-color: ${tag.color}">${tag.name}</span>
                    </label>
                  `;
                }).join('') : '<p class="text-muted">No tags available.</p>'}
              </div>
            </div>

            <div class="form-group">
              <label for="cutoff-date">Date Cutoff *</label>
              <select id="cutoff-date" name="cutoff_days" required onchange="window.updateContentPreview()">
                <option value="1" ${output.config.cutoff_days === 1 ? 'selected' : ''}>Last day (24 hours)</option>
                <option value="7" ${output.config.cutoff_days === 7 ? 'selected' : ''}>Last 7 days</option>
                <option value="30" ${output.config.cutoff_days === 30 ? 'selected' : ''}>Last 30 days</option>
                <option value="90" ${output.config.cutoff_days === 90 ? 'selected' : ''}>Last 90 days</option>
                <option value="-1" ${output.config.cutoff_days === -1 ? 'selected' : ''}>All time</option>
              </select>
            </div>

            <div class="form-group">
              <div id="content-preview-section" class="content-preview-section">
                <div class="preview-header">
                  <strong>Content Preview</strong>
                  <span id="content-count-badge" class="badge badge-secondary">0 items</span>
                </div>
                <div id="content-preview-list" class="content-preview-list">
                  <p class="text-muted" style="text-align: center; padding: 2rem;">Loading...</p>
                </div>
              </div>
            </div>
          </div>

          <div class="form-section">
            <h4>Gmail Settings</h4>
            
            <div class="form-group">
              <label>Recipient Emails *</label>
              <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
                <input type="email" id="recipient-input" placeholder="email@example.com" style="flex: 1;">
                <button type="button" class="btn-sm" onclick="window.addRecipient()">Add Email</button>
              </div>
              <div id="recipients-list" style="display: flex; flex-wrap: wrap; gap: 0.5rem; min-height: 42px; padding: 0.5rem; border: 1px solid var(--border-light); border-radius: 2px; background: var(--bg-secondary);">
              </div>
              <small class="text-muted">Add one or more email addresses to send the output to</small>
            </div>

            <div class="form-group">
              <label for="subject">Email Subject *</label>
              <input type="text" id="subject" name="subject" required value="${escapeHtml(output.config.subject || '')}">
            </div>

            <div class="form-group">
              <label for="gmail-labels">Gmail Labels (comma-separated)</label>
              <input type="text" id="gmail-labels" name="labels" value="${output.config.labels ? output.config.labels.join(', ') : ''}">
              <small class="text-muted">Labels will be created if they don't exist. "Palimpsest App" label is always added automatically.</small>
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
                  value="${scheduleConfig.time || '17:00'}"
                >
              </div>
              
              <div class="form-group">
                <label for="interval-type">Interval Type</label>
                <select id="interval-type" name="intervalType" class="form-control">
                  <option value="hourly" ${scheduleConfig.intervalType === 'hourly' ? 'selected' : ''}>Hourly</option>
                  <option value="daily" ${scheduleConfig.intervalType === 'daily' ? 'selected' : ''}>Daily</option>
                  <option value="weekly" ${scheduleConfig.intervalType === 'weekly' ? 'selected' : ''}>Weekly</option>
                  <option value="monthly" ${scheduleConfig.intervalType === 'monthly' ? 'selected' : ''}>Monthly</option>
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
                  value="${scheduleConfig.intervalValue || 1}"
                >
              </div>
            </div>
            
            <div class="form-group">
              <label for="end-date">End Date (Optional)</label>
              <input 
                type="date" 
                id="end-date" 
                name="endDate" 
                class="form-control"
                value="${scheduleConfig.endDate || ''}"
              >
            </div>

            <div class="schedule-preview">
              <strong>Schedule Preview:</strong> <span id="schedule-preview-text"></span>
            </div>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="active" name="active" ${output.active ? 'checked' : ''}>
              <span>Active</span>
            </label>
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
            const form = document.getElementById('edit-output-form');
            if (!form.checkValidity()) {
              form.reportValidity();
              return;
            }

            const formData = m.getFormData();
            
            const selectedTags = Array.from(document.querySelectorAll('#tags-selector input[name="tag"]:checked'))
              .map(input => parseInt(input.value));

            if (recipients.length === 0) {
              showNotification('Please add at least one recipient email', 'error');
              return;
            }

            const labelsInput = formData.labels || '';
            const labels = labelsInput.split(',').map(l => l.trim()).filter(l => l.length > 0);

            const scheduleConfig = {
              time: formData.scheduleTime,
              intervalType: formData.intervalType,
              intervalValue: parseInt(formData.intervalValue),
              endDate: formData.endDate || null
            };

            const cronExpression = generateCronExpression(scheduleConfig);

            const outputData = {
              name: formData.name,
              type: formData.type,
              config: {
                recipients: recipients,
                subject: formData.subject,
                labels: labels,
                cutoff_days: parseInt(formData.cutoff_days),
                content_separator: '\n\n---\n\n',
                include_metadata: true,
                content_type: 'text/plain',
                schedule_config: scheduleConfig
              },
              schedule: cronExpression,
              active: formData.active
            };

            m.setLoading(true);
            
            try {
              await api.updateOutput(id, outputData);
              await api.setOutputTags(id, selectedTags);
              
              m.close();
              showNotification('Output updated successfully', 'success');
              loadOutputs();
            } catch (error) {
              m.setLoading(false);
              showNotification('Failed to update output: ' + error.message, 'error');
            }
          }
        }
      ]
    });

    // Render initial recipients list
    renderRecipientsList();
    
    // Update schedule preview and content preview
    updateSchedulePreview();
    window.updateContentPreview();
    
    // Add event listeners
    ['schedule-time', 'interval-type', 'interval-value', 'end-date'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', updateSchedulePreview);
    });
  } catch (error) {
    hideLoading();
    showNotification('Failed to load output: ' + error.message, 'error');
  }
};

window.deleteOutput = async (id) => {
  if (!confirm('Are you sure you want to delete this output?')) return;
  
  try {
    showLoading();
    await api.deleteOutput(id);
    hideLoading();
    showNotification('Output deleted successfully', 'success');
    loadOutputs();
  } catch (error) {
    hideLoading();
    showNotification('Failed to delete output: ' + error.message, 'error');
  }
};

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Schedule helper functions
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

  console.log('[Outputs] Schedule configuration:', schedule);

  const previewText = formatSchedule(schedule);
  console.log('[Outputs] Schedule preview text:', previewText);
  
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
  
  if (intervalType === 'hourly') {
    return `${minutes} */${intervalValue} * * *`;
  } else if (intervalType === 'daily') {
    if (intervalValue === 1) {
      return `${minutes} ${hours} * * *`;
    } else {
      return `${minutes} ${hours} */${intervalValue} * *`;
    }
  } else if (intervalType === 'weekly') {
    if (intervalValue === 1) {
      return `${minutes} ${hours} * * 0`;
    } else {
      return `${minutes} ${hours} */${7 * intervalValue} * *`;
    }
  } else if (intervalType === 'monthly') {
    if (intervalValue === 1) {
      return `${minutes} ${hours} 1 * *`;
    } else {
      return `${minutes} ${hours} 1 */${intervalValue} *`;
    }
  }
  
  return `${minutes} ${hours} * * *`;
}

function calculateNextRunAt(schedule, fromTime = new Date()) {
  if (!schedule || !schedule.time) return null;
  
  const { time, intervalType, intervalValue, endDate } = schedule;
  const [hours, minutes] = time.split(':');
  
  let nextRun = new Date(fromTime);
  nextRun.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  
  if (intervalType === 'hourly') {
    while (nextRun <= fromTime) {
      nextRun.setHours(nextRun.getHours() + parseInt(intervalValue));
    }
  } else {
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
  
  if (endDate) {
    const endDateTime = new Date(endDate);
    endDateTime.setHours(23, 59, 59, 999);
    if (nextRun > endDateTime) {
      return null;
    }
  }
  
  return nextRun.toISOString();
}

// Recipients management
let recipients = [];

window.addRecipient = () => {
  const input = document.getElementById('recipient-input');
  const email = input.value.trim();
  
  if (!email) {
    showNotification('Please enter an email address', 'error');
    return;
  }
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showNotification('Please enter a valid email address', 'error');
    return;
  }
  
  // Check for duplicates
  if (recipients.includes(email)) {
    showNotification('This email is already added', 'error');
    return;
  }
  
  recipients.push(email);
  input.value = '';
  renderRecipientsList();
};

window.removeRecipient = (email) => {
  recipients = recipients.filter(r => r !== email);
  renderRecipientsList();
};

function renderRecipientsList() {
  const container = document.getElementById('recipients-list');
  
  if (recipients.length === 0) {
    container.innerHTML = '<span class="text-muted" style="font-size: 0.875rem;">No recipients added yet</span>';
    return;
  }
  
  container.innerHTML = recipients.map(email => `
    <span style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.75rem; background: var(--accent-primary); color: white; border-radius: 12px; font-size: 0.875rem; font-family: var(--font-sans);">
      ✉️ ${escapeHtml(email)}
      <button type="button" onclick="window.removeRecipient('${email}')" style="background: rgba(255, 255, 255, 0.3); border: none; width: 18px; height: 18px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.75rem; padding: 0;">×</button>
    </span>
  `).join('');
}

// Update content preview based on selected tags and date cutoff
window.updateContentPreview = async () => {
  const selectedTags = Array.from(document.querySelectorAll('#tags-selector input[name="tag"]:checked'))
    .map(input => parseInt(input.value));
  
  const cutoffDays = parseInt(document.getElementById('cutoff-date').value);
  const previewList = document.getElementById('content-preview-list');
  const countBadge = document.getElementById('content-count-badge');
  
  // Show loading state
  previewList.innerHTML = '<p class="text-muted" style="text-align: center; padding: 2rem;">Loading preview...</p>';
  
  try {
    const preview = await api.previewOutputContent(selectedTags, cutoffDays);
    
    countBadge.textContent = `${preview.count} item${preview.count !== 1 ? 's' : ''}`;
    countBadge.className = `badge ${preview.count > 0 ? 'badge-success' : 'badge-secondary'}`;
    
    if (preview.count === 0) {
      previewList.innerHTML = '<p class="text-muted" style="text-align: center; padding: 2rem;">No content matches the selected filters</p>';
      return;
    }
    
    previewList.innerHTML = preview.content.map(content => {
      const contentPreview = (content.edited_content || content.content).substring(0, 150);
      const tagNames = content.tag_names && content.tag_names.length > 0 ? content.tag_names : [];
      const tagColors = content.tag_colors && content.tag_colors.length > 0 ? content.tag_colors : [];
      
      return `
        <div class="content-preview-item">
          <div class="content-preview-meta">
            <span class="content-preview-date">${new Date(content.created_at).toLocaleDateString()}</span>
            <div class="content-preview-tags">
              ${tagNames.map((name, idx) => `
                <span class="tag-badge" style="background-color: ${tagColors[idx]}">${name}</span>
              `).join('')}
            </div>
          </div>
          <p class="content-preview-text">${escapeHtml(contentPreview)}${contentPreview.length >= 150 ? '...' : ''}</p>
        </div>
      `;
    }).join('');
  } catch (error) {
    previewList.innerHTML = `<p class="text-muted" style="text-align: center; padding: 2rem; color: var(--error);">Error loading preview: ${error.message}</p>`;
    countBadge.textContent = '0 items';
    countBadge.className = 'badge badge-secondary';
  }
};
