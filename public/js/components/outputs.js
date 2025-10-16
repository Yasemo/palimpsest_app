import { api } from '../api.js';
import { showLoading, hideLoading, showNotification } from '../router.js';

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

  window.createOutput = () => {
    const name = prompt('Output name:');
    const recipient = prompt('Gmail recipient email:');
    const subject = prompt('Email subject:');
    if (name && recipient && subject) {
      createNewOutput(name, recipient, subject);
    }
  };

  loadOutputs();
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

    container.innerHTML = outputs.map(output => `
      <div class="card">
        <div class="card-header">
          <h3>${output.name}</h3>
          <span class="badge ${output.active ? 'badge-success' : 'badge-secondary'}">
            ${output.active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div class="card-body">
          <p><strong>Type:</strong> ${output.type}</p>
          <p><strong>Recipient:</strong> ${output.config.recipient || 'N/A'}</p>
          <p><strong>Subject:</strong> ${output.config.subject || 'N/A'}</p>
          <p><strong>Schedule:</strong> ${output.schedule || 'None'}</p>
        </div>
        <div class="card-actions">
          <button class="btn-sm" onclick="window.executeOutput(${output.id})">Execute</button>
          <button class="btn-sm btn-danger" onclick="window.deleteOutput(${output.id})">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    hideLoading();
    showNotification('Failed to load outputs: ' + error.message, 'error');
  }
}

async function createNewOutput(name, recipient, subject) {
  try {
    showLoading();
    await api.createOutput({
      name,
      type: 'gmail',
      config: {
        recipient,
        subject,
        content_type: 'text/plain'
      },
      active: true
    });
    hideLoading();
    showNotification('Output created successfully', 'success');
    loadOutputs();
  } catch (error) {
    hideLoading();
    showNotification('Failed to create output: ' + error.message, 'error');
  }
}

window.executeOutput = async (id) => {
  try {
    showLoading();
    const result = await api.executeOutput(id);
    hideLoading();
    showNotification(`Output executed! Sent ${result.contentCount} items.`, 'success');
  } catch (error) {
    hideLoading();
    showNotification('Failed to execute output: ' + error.message, 'error');
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
