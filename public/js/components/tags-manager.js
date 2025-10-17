import { api } from '../api.js';
import { showLoading, hideLoading, showNotification } from '../router.js';
import Modal from './modal.js';

let allTags = [];
let searchTerm = '';

export async function renderTagsManager() {
  const container = document.getElementById('app-content');
  
  container.innerHTML = `
    <div class="page-header">
      <h2>Tags Management</h2>
      <p>Create and manage tags for organizing your content</p>
      <button class="btn-primary" id="create-tag-btn">
        <i data-feather="plus"></i>
        Create New Tag
      </button>
    </div>
    
    <div class="tags-manager-controls" style="margin-bottom: 2rem;">
      <input 
        type="text" 
        id="tag-search" 
        class="form-control" 
        placeholder="Search tags by name..."
        style="max-width: 400px;"
      >
    </div>
    
    <div id="tags-grid" class="tags-manager-grid">
      <div class="loading-text">Loading tags...</div>
    </div>
  `;

  // Add event listeners
  document.getElementById('create-tag-btn').addEventListener('click', () => showTagModal());
  document.getElementById('tag-search').addEventListener('input', (e) => {
    searchTerm = e.target.value.toLowerCase();
    renderTagsGrid();
  });

  await loadTags();
  
  // Initialize feather icons
  if (window.feather) feather.replace();
}

async function loadTags() {
  try {
    showLoading();
    allTags = await api.getTags();
    hideLoading();
    renderTagsGrid();
  } catch (error) {
    hideLoading();
    showNotification('Failed to load tags: ' + error.message, 'error');
  }
}

function renderTagsGrid() {
  const container = document.getElementById('tags-grid');
  if (!container) return;
  
  // Filter tags based on search
  const filteredTags = allTags.filter(tag => 
    tag.name.toLowerCase().includes(searchTerm)
  );
  
  if (filteredTags.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>${searchTerm ? 'No tags match your search' : 'No tags created yet'}</p>
        <p class="text-muted">${searchTerm ? 'Try a different search term' : 'Create your first tag to get started'}</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = filteredTags.map(tag => `
    <div class="tag-manager-card" style="border-left: 4px solid ${tag.color};">
      <div class="tag-manager-header">
        <div class="tag-manager-color" style="background-color: ${tag.color};"></div>
        <h4>${escapeHtml(tag.name)}</h4>
      </div>
      <div class="tag-manager-body">
        <div class="tag-stats">
          <div class="tag-stat-item">
            <i data-feather="box"></i>
            <span class="stat-label">Color:</span>
            <span class="stat-value">${tag.color}</span>
          </div>
          <div class="tag-stat-item">
            <i data-feather="calendar"></i>
            <span class="stat-label">Created:</span>
            <span class="stat-value">${formatDate(tag.created_at)}</span>
          </div>
        </div>
      </div>
      <div class="tag-manager-actions">
        <button class="btn-sm btn-primary" onclick="window.editTag(${tag.id}, '${escapeHtml(tag.name)}', '${tag.color}')">
          <i data-feather="edit-2"></i>
          Edit
        </button>
        <button class="btn-sm btn-danger" onclick="window.deleteTag(${tag.id}, '${escapeHtml(tag.name)}')">
          <i data-feather="trash-2"></i>
          Delete
        </button>
      </div>
    </div>
  `).join('');
  
  // Re-initialize feather icons
  if (window.feather) feather.replace();
}

function showTagModal(tag = null) {
  const isEdit = !!tag;
  
  const modal = new Modal();
  modal.create({
    title: isEdit ? 'Edit Tag' : 'Create New Tag',
    size: 'medium',
    content: `
      <form id="tag-form" class="form">
        <div class="form-group">
          <label for="tag-name">Tag Name *</label>
          <input 
            type="text" 
            id="tag-name" 
            name="name" 
            class="form-control"
            value="${tag ? escapeHtml(tag.name) : ''}"
            required
            placeholder="e.g., Important, Research, Follow-up"
            maxlength="50"
          >
          <small class="form-text">Choose a descriptive name for this tag</small>
        </div>
        
        <div class="form-group">
          <label>Tag Color *</label>
          <div class="tag-color-selector">
            <div class="color-picker-grid" id="color-picker-grid">
              ${generateColorOptions(tag?.color)}
            </div>
            <div class="custom-color-row">
              <input 
                type="color" 
                id="custom-color-input" 
                class="custom-color-input"
                value="${tag?.color || '#3498db'}"
              >
              <label for="custom-color-input">Custom Color</label>
            </div>
          </div>
          <input type="hidden" id="selected-color" name="color" value="${tag?.color || '#3498db'}">
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
        label: isEdit ? 'Save Changes' : 'Create Tag',
        className: 'btn-primary',
        onClick: async (m) => {
          const form = document.getElementById('tag-form');
          if (!form.checkValidity()) {
            form.reportValidity();
            return;
          }
          
          const formData = m.getFormData();
          await saveTag(formData, tag?.id, m);
        }
      }
    ]
  });
  
  // Setup color picker interactions
  setupColorPicker(tag?.color);
}

function generateColorOptions(selectedColor) {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788',
    '#E63946', '#457B9D', '#F1FAEE', '#A8DADC', '#1D3557',
    '#6A4C93', '#1982C4', '#8AC926', '#FFCA3A', '#FF595E',
    '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
    '#1abc9c', '#34495e', '#16a085', '#27ae60', '#2980b9'
  ];
  
  return colors.map(color => `
    <button 
      type="button" 
      class="color-option ${color === selectedColor ? 'selected' : ''}" 
      data-color="${color}" 
      style="background-color: ${color};"
      title="${color}"
    ></button>
  `).join('');
}

function setupColorPicker(initialColor) {
  const colorOptions = document.querySelectorAll('.color-option');
  const customColorInput = document.getElementById('custom-color-input');
  const selectedColorInput = document.getElementById('selected-color');
  
  // Handle preset color selection
  colorOptions.forEach(option => {
    option.addEventListener('click', () => {
      // Remove selected class from all options
      colorOptions.forEach(opt => opt.classList.remove('selected'));
      
      // Add selected class to clicked option
      option.classList.add('selected');
      
      // Update hidden input
      const color = option.dataset.color;
      selectedColorInput.value = color;
      customColorInput.value = color;
    });
  });
  
  // Handle custom color input
  customColorInput.addEventListener('input', (e) => {
    const color = e.target.value;
    selectedColorInput.value = color;
    
    // Remove selected class from preset options
    colorOptions.forEach(opt => opt.classList.remove('selected'));
  });
}

async function saveTag(formData, tagId, modal) {
  try {
    modal.setLoading(true);
    
    const tagData = {
      name: formData.name.trim(),
      color: formData.color
    };
    
    // Check for duplicate tag names (case-insensitive)
    const duplicateTag = allTags.find(tag => 
      tag.name.toLowerCase() === tagData.name.toLowerCase() && 
      tag.id !== tagId
    );
    
    if (duplicateTag) {
      modal.setLoading(false);
      showNotification(
        `A tag named "${duplicateTag.name}" already exists. Please choose a different name.`,
        'error'
      );
      return;
    }
    
    if (tagId) {
      // Update tag
      await api.request(`/api/tags/${tagId}`, {
        method: 'PUT',
        body: JSON.stringify(tagData)
      });
      showNotification('Tag updated successfully', 'success');
    } else {
      // Create new tag
      await api.createTag(tagData);
      showNotification('Tag created successfully', 'success');
    }
    
    modal.close();
    await loadTags();
  } catch (error) {
    modal.setLoading(false);
    showNotification('Failed to save tag: ' + error.message, 'error');
  }
}

window.editTag = (id, name, color) => {
  const tag = allTags.find(t => t.id === id);
  if (tag) {
    showTagModal(tag);
  }
};

window.deleteTag = async (id, name) => {
  const confirmed = confirm(
    `Are you sure you want to delete the tag "${name}"?\n\nThis will remove the tag from all queries, info packages, and content items.`
  );
  
  if (!confirmed) return;
  
  try {
    showLoading();
    await api.request(`/api/tags/${id}`, {
      method: 'DELETE'
    });
    hideLoading();
    showNotification('Tag deleted successfully', 'success');
    await loadTags();
  } catch (error) {
    hideLoading();
    showNotification('Failed to delete tag: ' + error.message, 'error');
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
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}
