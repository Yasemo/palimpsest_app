import { api } from '../api.js';

// Tag Input Component
export class TagInput {
  constructor(container, options = {}) {
    this.container = container;
    this.selectedTags = options.initialTags || [];
    this.allTags = [];
    this.onChange = options.onChange || (() => {});
    
    this.render();
    this.loadTags();
  }

  async loadTags() {
    try {
      this.allTags = await api.getTags();
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="tag-input-wrapper">
        <div class="selected-tags" id="selected-tags"></div>
        <div class="tag-input-row">
          <input 
            type="text" 
            class="form-control tag-search-input" 
            id="tag-search-input"
            placeholder="Type to search or create tags..."
            autocomplete="off"
          >
          <button type="button" class="btn-sm btn-link" id="create-tag-btn" style="display: none;">
            + Create Tag
          </button>
        </div>
        <div class="tag-suggestions" id="tag-suggestions" style="display: none;"></div>
        <div class="tag-color-picker" id="tag-color-picker" style="display: none;">
          <div class="color-picker-header">
            <span>Choose a color for <strong id="new-tag-name"></strong></span>
            <button type="button" class="btn-link" id="cancel-color-picker">✕</button>
          </div>
          <div class="color-picker-grid" id="color-picker-grid"></div>
          <div class="color-picker-custom">
            <input type="color" id="custom-color-input" class="custom-color-input">
            <label for="custom-color-input">Custom Color</label>
          </div>
        </div>
      </div>
    `;

    this.renderSelectedTags();
    this.attachEventListeners();
  }

  renderSelectedTags() {
    const container = this.container.querySelector('#selected-tags');
    if (!container) return;

    if (this.selectedTags.length === 0) {
      container.innerHTML = '<span class="text-muted">No tags selected</span>';
      return;
    }

    container.innerHTML = this.selectedTags.map(tag => `
      <span class="tag-chip" style="background-color: ${tag.color};">
        ${this.escapeHtml(tag.name)}
        <button type="button" class="tag-remove" data-tag-id="${tag.id}">✕</button>
      </span>
    `).join('');

    // Attach remove listeners
    container.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tagId = parseInt(e.target.dataset.tagId);
        this.removeTag(tagId);
      });
    });
  }

  attachEventListeners() {
    const input = this.container.querySelector('#tag-search-input');
    const suggestionsDiv = this.container.querySelector('#tag-suggestions');
    const createBtn = this.container.querySelector('#create-tag-btn');
    const colorPicker = this.container.querySelector('#tag-color-picker');
    const cancelColorBtn = this.container.querySelector('#cancel-color-picker');

    if (!input) return;

    // Input change for autocomplete
    input.addEventListener('input', (e) => {
      const searchTerm = e.target.value.trim().toLowerCase();
      
      if (searchTerm.length === 0) {
        suggestionsDiv.style.display = 'none';
        createBtn.style.display = 'none';
        return;
      }

      // Filter existing tags
      const matchingTags = this.allTags.filter(tag => 
        tag.name.toLowerCase().includes(searchTerm) &&
        !this.selectedTags.find(st => st.id === tag.id)
      );

      if (matchingTags.length > 0) {
        this.renderSuggestions(matchingTags);
        suggestionsDiv.style.display = 'block';
        
        // Check if exact match exists
        const exactMatch = matchingTags.find(tag => tag.name.toLowerCase() === searchTerm);
        createBtn.style.display = exactMatch ? 'none' : 'inline-block';
      } else {
        suggestionsDiv.style.display = 'none';
        createBtn.style.display = 'inline-block';
      }
    });

    // Create tag button
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        const tagName = input.value.trim();
        if (tagName) {
          this.showColorPicker(tagName);
        }
      });
    }

    // Cancel color picker
    if (cancelColorBtn) {
      cancelColorBtn.addEventListener('click', () => {
        colorPicker.style.display = 'none';
      });
    }

    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        suggestionsDiv.style.display = 'none';
      }
    });
  }

  renderSuggestions(tags) {
    const suggestionsDiv = this.container.querySelector('#tag-suggestions');
    if (!suggestionsDiv) return;

    suggestionsDiv.innerHTML = tags.map(tag => `
      <div class="tag-suggestion" data-tag-id="${tag.id}">
        <span class="tag-color-dot" style="background-color: ${tag.color};"></span>
        ${this.escapeHtml(tag.name)}
      </div>
    `).join('');

    // Attach click listeners
    suggestionsDiv.querySelectorAll('.tag-suggestion').forEach(div => {
      div.addEventListener('click', () => {
        const tagId = parseInt(div.dataset.tagId);
        const tag = this.allTags.find(t => t.id === tagId);
        if (tag) {
          this.addTag(tag);
          this.container.querySelector('#tag-search-input').value = '';
          suggestionsDiv.style.display = 'none';
          this.container.querySelector('#create-tag-btn').style.display = 'none';
        }
      });
    });
  }

  showColorPicker(tagName) {
    const colorPicker = this.container.querySelector('#tag-color-picker');
    const nameSpan = this.container.querySelector('#new-tag-name');
    const gridContainer = this.container.querySelector('#color-picker-grid');
    const customColorInput = this.container.querySelector('#custom-color-input');

    if (!colorPicker || !nameSpan || !gridContainer) return;

    nameSpan.textContent = tagName;
    
    // Predefined color palette
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
      '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788',
      '#E63946', '#457B9D', '#F1FAEE', '#A8DADC', '#1D3557',
      '#6A4C93', '#1982C4', '#8AC926', '#FFCA3A', '#FF595E'
    ];

    gridContainer.innerHTML = colors.map(color => `
      <button type="button" class="color-option" data-color="${color}" style="background-color: ${color};">
      </button>
    `).join('');

    // Attach color selection listeners
    gridContainer.querySelectorAll('.color-option').forEach(btn => {
      btn.addEventListener('click', async () => {
        const color = btn.dataset.color;
        await this.createAndAddTag(tagName, color);
      });
    });

    // Custom color selection
    if (customColorInput) {
      customColorInput.value = '#3498db';
      customColorInput.addEventListener('change', async () => {
        await this.createAndAddTag(tagName, customColorInput.value);
      });
    }

    colorPicker.style.display = 'block';
  }

  async createAndAddTag(name, color) {
    try {
      const newTag = await api.createTag({ name, color });
      this.allTags.push(newTag);
      this.addTag(newTag);
      
      // Clear input and hide color picker
      this.container.querySelector('#tag-search-input').value = '';
      this.container.querySelector('#tag-color-picker').style.display = 'none';
      this.container.querySelector('#create-tag-btn').style.display = 'none';
      this.container.querySelector('#tag-suggestions').style.display = 'none';
    } catch (error) {
      console.error('Failed to create tag:', error);
      alert('Failed to create tag: ' + error.message);
    }
  }

  addTag(tag) {
    if (!this.selectedTags.find(t => t.id === tag.id)) {
      this.selectedTags.push(tag);
      this.renderSelectedTags();
      this.onChange(this.selectedTags);
    }
  }

  removeTag(tagId) {
    this.selectedTags = this.selectedTags.filter(t => t.id !== tagId);
    this.renderSelectedTags();
    this.onChange(this.selectedTags);
  }

  getSelectedTagIds() {
    return this.selectedTags.map(t => t.id);
  }

  async setTags(tagIds) {
    if (!Array.isArray(tagIds)) return;
    
    // Load all tags if not loaded
    if (this.allTags.length === 0) {
      await this.loadTags();
    }

    this.selectedTags = this.allTags.filter(t => tagIds.includes(t.id));
    this.renderSelectedTags();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Helper function to render tag badges
export function renderTagBadges(tags) {
  if (!tags || tags.length === 0) {
    return '';
  }

  return tags.map(tag => `
    <span class="tag-badge" style="background-color: ${tag.color};">
      ${escapeHtml(tag.name)}
    </span>
  `).join('');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
