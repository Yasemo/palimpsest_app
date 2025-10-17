import { api } from '../api.js';
import { showLoading, hideLoading, showNotification } from '../router.js';
import Modal from './modal.js';
import { renderTagBadges } from './tags.js';

// Markdown renderer with sanitization
function renderMarkdown(text) {
  if (!text) return '';
  const rawHtml = marked.parse(text);
  return DOMPurify.sanitize(rawHtml);
}

// Get plain text from markdown (for previews)
function getPlainTextPreview(markdown, maxLength = 200) {
  if (!markdown) return '';
  // Remove markdown syntax for preview
  const plain = markdown
    .replace(/[#*`_\[\]()]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
  return plain.length > maxLength ? plain.substring(0, maxLength) + '...' : plain;
}

export async function renderContent() {
  const container = document.getElementById('app-content');
  
  container.innerHTML = `
    <div class="page-header">
      <h2>Content</h2>
      <p>AI-generated content from info packages</p>
    </div>
    <div id="content-grid" class="content-grid">
      <div class="loading-text">Loading content...</div>
    </div>
  `;

  window.loadContentList();
}

window.loadContentList = async function() {
  try {
    showLoading();
    const content = await api.getContent();
    hideLoading();

    const container = document.getElementById('content-grid');
    if (content.length === 0) {
      container.innerHTML = '<div class="empty-state">No content yet. Execute queries and process info packages to generate content!</div>';
      return;
    }

    // Load tags for all content items in parallel
    const contentWithTags = await Promise.all(
      content.map(async (item) => {
        try {
          const tags = await api.getContentTags(item.id);
          return { ...item, tags };
        } catch (error) {
          console.error(`Failed to load tags for content ${item.id}:`, error);
          return { ...item, tags: [] };
        }
      })
    );

    container.innerHTML = contentWithTags.map(item => {
      const contentText = item.edited_content || item.content;
      const preview = getPlainTextPreview(contentText);
      
      return `
        <div class="content-card" onclick="window.viewContent(${item.id})">
          <div class="content-preview markdown-preview">
            ${preview}
          </div>
          ${item.tags && item.tags.length > 0 ? `
            <div class="tags-container" onclick="event.stopPropagation()">
              ${renderTagBadges(item.tags)}
            </div>
          ` : ''}
          <div class="content-meta">
            <span class="content-date">${new Date(item.created_at).toLocaleDateString()}</span>
            <button class="btn-sm btn-danger" onclick="event.stopPropagation(); window.deleteContent(${item.id})">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    hideLoading();
    showNotification('Failed to load content: ' + error.message, 'error');
  }
};

window.viewContent = async (id) => {
  try {
    showLoading();
    const [item, models, editorConfig, tags] = await Promise.all([
      api.getContentItem(id),
      api.getAIModels(),
      api.request('/api/content/editor-config'),
      api.getContentTags(id).catch(() => [])
    ]);
    hideLoading();

    const content = item.edited_content || item.content;
    const chatHistory = item.chat_history || [];
    
    const defaultModel = editorConfig.defaultModel || 'anthropic/claude-3.5-sonnet';

    const modal = new Modal();
    modal.create({
      title: 'Content Editor',
      size: 'large',
      content: `
        <div class="content-editor-container" data-view="content-only">
          <!-- Left Panel Toggle Button -->
          <button class="content-toggle-btn" id="content-toggle-btn" title="Toggle content panel">
            <i data-feather="chevron-left"></i>
          </button>

          <!-- Left Panel: Editable Content -->
          <div class="content-editor-panel" id="content-panel">
            <div class="panel-header">
              <div>
                <h4>Content</h4>
                <small class="text-muted">Edit and preview your content</small>
              </div>
              <!-- Edit/Preview Toggle -->
              <div class="mode-toggle">
                <button class="mode-btn" data-mode="edit" id="edit-mode-btn">
                  <i data-feather="edit-3"></i> Edit
                </button>
                <button class="mode-btn active" data-mode="preview" id="preview-mode-btn">
                  <i data-feather="eye"></i> Preview
                </button>
              </div>
            </div>
            
            ${tags && tags.length > 0 ? `
              <div class="tags-container" style="padding: 0 1rem 0.5rem 1rem;">
                ${renderTagBadges(tags)}
              </div>
            ` : ''}
            
            <!-- Edit Mode -->
            <div class="content-mode" id="edit-mode" style="display: none;">
              <textarea id="content-editor" class="content-textarea" rows="20">${escapeHtml(content)}</textarea>
              <div class="editor-actions">
                <button class="btn-primary" onclick="window.saveContentEdit(${id})">
                  <i data-feather="save"></i> Save Changes
                </button>
              </div>
            </div>
            
            <!-- Preview Mode -->
            <div class="content-mode" id="preview-mode">
              <div class="content-preview-area markdown-content">
                ${renderMarkdown(content)}
              </div>
              <div class="editor-actions">
                <button class="btn-secondary" onclick="document.getElementById('edit-mode-btn').click()">
                  <i data-feather="edit-3"></i> Edit Content
                </button>
              </div>
            </div>
          </div>

          <!-- Right Panel: AI Assistant Chat -->
          <div class="content-chat-panel" id="chat-panel" style="display: none;">
            <div class="panel-header">
              <div>
                <h4>AI Assistant</h4>
                <small class="text-muted">Get help refining your content</small>
              </div>
              ${chatHistory.length > 0 ? `
                <button class="btn-sm btn-secondary" onclick="window.clearChatHistory(${id})" title="Clear chat history">
                  <i data-feather="trash-2"></i> Clear Chat
                </button>
              ` : ''}
            </div>
            
            <!-- Model Selector -->
            <div class="chat-model-selector">
              <label for="chat-model-select">Model:</label>
              <select id="chat-model-select" class="form-control">
                ${models.map(model => `
                  <option value="${escapeHtml(model.id)}" ${model.id === defaultModel ? 'selected' : ''}>
                    ${escapeHtml(model.name || model.id)} - $${formatModelCost(model.pricing?.prompt)}/1M
                  </option>
                `).join('')}
              </select>
            </div>

            <!-- Chat History -->
            <div class="chat-history" id="chat-history">
              ${chatHistory.length === 0 ? `
                <div class="chat-empty-state">
                  <p>💬 Start a conversation</p>
                  <p class="text-muted">Ask the AI to help you refine, expand, or improve your content.</p>
                </div>
              ` : chatHistory.map((msg, index) => {
                const msgId = `history-msg-${index}`;
                return `
                  <div class="chat-bubble chat-${msg.role}">
                    <div class="chat-bubble-header">
                      <strong>${msg.role === 'user' ? 'You' : 'AI'}</strong>
                    </div>
                    <div class="chat-bubble-content markdown-content" id="${msgId}">${renderMarkdown(msg.content)}</div>
                    ${msg.role === 'assistant' ? `
                      <div class="chat-bubble-actions">
                        <button class="btn-sm btn-save-response" onclick="window.saveAIResponseAsContent('${msgId}')">
                          <i data-feather="plus-circle"></i> Save as Content Card
                        </button>
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>

            <!-- Chat Input -->
            <div class="chat-input-container">
              <input 
                type="text" 
                id="chat-message" 
                class="chat-input" 
                placeholder="Ask AI for suggestions..." 
                onkeypress="if(event.key==='Enter' && !event.shiftKey) { event.preventDefault(); window.sendChatMessage(${id}); }" 
              />
              <button class="btn-send" onclick="window.sendChatMessage(${id})">
                <i data-feather="send"></i>
              </button>
            </div>
          </div>
        </div>
      `,
      actions: [
        {
          id: 'toggle-chat',
          label: 'Show Chat',
          className: 'btn-secondary',
          onClick: (m) => {
            window.toggleChatPanel();
          }
        },
        {
          id: 'save-variant',
          label: 'Save as New Content Card',
          className: 'btn-primary',
          onClick: async (m) => {
            await window.saveContentAsVariant(id, m);
          }
        },
        {
          id: 'close',
          label: 'Close',
          className: 'btn-secondary',
          onClick: (m) => {
            m.close();
            window.loadContentList();
          }
        }
      ]
    });

    // Setup mode toggle functionality
    setupModeToggle();
    
    // Setup content panel toggle
    setupContentToggle();

    // Initialize feather icons
    if (window.feather) feather.replace();
  } catch (error) {
    hideLoading();
    showNotification('Failed to load content: ' + error.message, 'error');
  }
};

function setupModeToggle() {
  const editBtn = document.getElementById('edit-mode-btn');
  const previewBtn = document.getElementById('preview-mode-btn');
  const editMode = document.getElementById('edit-mode');
  const previewMode = document.getElementById('preview-mode');
  const contentEditor = document.getElementById('content-editor');
  const previewArea = document.querySelector('.content-preview-area');

  if (!editBtn || !previewBtn) return;

  editBtn.addEventListener('click', () => {
    editBtn.classList.add('active');
    previewBtn.classList.remove('active');
    editMode.style.display = 'block';
    previewMode.style.display = 'none';
  });

  previewBtn.addEventListener('click', () => {
    previewBtn.classList.add('active');
    editBtn.classList.remove('active');
    editMode.style.display = 'none';
    previewMode.style.display = 'block';
    
    // Update preview with current content
    if (previewArea && contentEditor) {
      previewArea.innerHTML = renderMarkdown(contentEditor.value);
    }
  });
}

function setupContentToggle() {
  const toggleBtn = document.getElementById('content-toggle-btn');
  const container = document.querySelector('.content-editor-container');
  const contentPanel = document.getElementById('content-panel');
  
  if (!toggleBtn || !container || !contentPanel) return;

  toggleBtn.addEventListener('click', () => {
    const currentView = container.getAttribute('data-view');
    const icon = toggleBtn.querySelector('i');
    
    if (currentView === 'chat-only') {
      // Show content panel
      container.setAttribute('data-view', '50-50');
      contentPanel.style.display = 'flex';
      icon.setAttribute('data-feather', 'chevron-left');
      if (window.feather) feather.replace();
    } else {
      // Hide content panel (chat only view)
      container.setAttribute('data-view', 'chat-only');
      contentPanel.style.display = 'none';
      icon.setAttribute('data-feather', 'chevron-right');
      if (window.feather) feather.replace();
    }
  });
}

window.toggleChatPanel = function() {
  const container = document.querySelector('.content-editor-container');
  const chatPanel = document.getElementById('chat-panel');
  const toggleBtn = document.querySelector('[data-action="toggle-chat"]');
  const contentToggleBtn = document.getElementById('content-toggle-btn');
  
  if (!container || !chatPanel) return;

  const currentView = container.getAttribute('data-view');
  
  if (currentView === 'content-only') {
    // Show chat panel (50/50 view)
    container.setAttribute('data-view', '50-50');
    chatPanel.style.display = 'flex';
    if (toggleBtn) toggleBtn.textContent = 'Hide Chat';
    if (contentToggleBtn) contentToggleBtn.style.display = 'flex';
  } else if (currentView === '50-50') {
    // Hide chat panel (content only)
    container.setAttribute('data-view', 'content-only');
    chatPanel.style.display = 'none';
    if (toggleBtn) toggleBtn.textContent = 'Show Chat';
    if (contentToggleBtn) contentToggleBtn.style.display = 'none';
  } else if (currentView === 'chat-only') {
    // Show content panel (50/50 view)
    container.setAttribute('data-view', '50-50');
    document.getElementById('content-panel').style.display = 'flex';
    if (toggleBtn) toggleBtn.textContent = 'Hide Chat';
  }
};

function formatModelCost(cost) {
  if (!cost) return '0.00';
  const costPerMillion = parseFloat(cost) * 1000000;
  return costPerMillion.toFixed(2);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.saveContentEdit = async (id) => {
  const edited_content = document.getElementById('content-editor').value;
  
  try {
    showLoading();
    await api.updateContent(id, { edited_content });
    hideLoading();
    showNotification('Content saved successfully', 'success');
    
    // Update preview if in preview mode
    const previewArea = document.querySelector('.content-preview-area');
    if (previewArea && document.getElementById('preview-mode').style.display !== 'none') {
      previewArea.innerHTML = renderMarkdown(edited_content);
    }
  } catch (error) {
    hideLoading();
    showNotification('Failed to save content: ' + error.message, 'error');
  }
};

window.sendChatMessage = async (id) => {
  const message = document.getElementById('chat-message').value;
  const currentContent = document.getElementById('content-editor').value;
  const selectedModel = document.getElementById('chat-model-select').value;
  
  if (!message) return;

  // Clear input immediately
  document.getElementById('chat-message').value = '';

  // Add user message to chat immediately for better UX
  const chatHistory = document.getElementById('chat-history');
  const chatEmpty = chatHistory.querySelector('.chat-empty-state');
  if (chatEmpty) chatEmpty.remove();
  
  chatHistory.innerHTML += `
    <div class="chat-bubble chat-user">
      <div class="chat-bubble-header">
        <strong>You</strong>
      </div>
      <div class="chat-bubble-content markdown-content">${renderMarkdown(message)}</div>
    </div>
  `;
  
  // Add typing indicator
  chatHistory.innerHTML += `
    <div class="chat-bubble chat-assistant typing-indicator" id="typing-indicator">
      <div class="chat-bubble-header">
        <strong>AI</strong>
      </div>
      <div class="typing-dots">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
    </div>
  `;
  chatHistory.scrollTop = chatHistory.scrollHeight;

  try {
    const result = await api.chatWithContent(id, message, currentContent, selectedModel);
    
    // Dispatch event to refresh credit balance
    document.dispatchEvent(new Event('ai-operation-complete'));
    
    // Remove typing indicator
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) typingIndicator.remove();

    // Add AI response to chat history with save button
    const responseId = 'response-' + Date.now();
    chatHistory.innerHTML += `
      <div class="chat-bubble chat-assistant">
        <div class="chat-bubble-header">
          <strong>AI</strong>
        </div>
        <div class="chat-bubble-content markdown-content" id="${responseId}">${renderMarkdown(result.response)}</div>
        <div class="chat-bubble-actions">
          <button class="btn-sm btn-save-response" onclick="window.saveAIResponseAsContent('${responseId}')">
            <i data-feather="plus-circle"></i> Save as Content Card
          </button>
        </div>
      </div>
    `;
    chatHistory.scrollTop = chatHistory.scrollHeight;
    
    // Initialize feather icons for any new icons
    if (window.feather) feather.replace();
  } catch (error) {
    // Remove typing indicator on error
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) typingIndicator.remove();
    
    showNotification('Failed to send message: ' + error.message, 'error');
  }
};

window.saveContentAsVariant = async (id, modal) => {
  const currentContent = document.getElementById('content-editor').value;
  
  if (!currentContent || !currentContent.trim()) {
    showNotification('Content is empty', 'error');
    return;
  }

  try {
    showLoading();
    const newContent = await api.saveContentVariant(id, currentContent);
    hideLoading();
    
    showNotification('New content card created successfully!', 'success');
    modal.close();
    window.loadContentList();
    
    // Navigate to new content after a brief delay
    setTimeout(() => {
      window.viewContent(newContent.id);
    }, 500);
  } catch (error) {
    hideLoading();
    showNotification('Failed to save variant: ' + error.message, 'error');
  }
};

window.saveAIResponseAsContent = async (responseId) => {
  const responseElement = document.getElementById(responseId);
  if (!responseElement) {
    showNotification('Response not found', 'error');
    return;
  }

  // Get the text content (strip HTML from markdown rendering)
  const responseText = responseElement.innerText || responseElement.textContent;
  
  if (!responseText || !responseText.trim()) {
    showNotification('Response is empty', 'error');
    return;
  }

  try {
    showLoading();
    // Create a new content card directly (no parent ID since it's from AI chat)
    const newContent = await api.request('/api/content', {
      method: 'POST',
      body: JSON.stringify({ content: responseText })
    });
    hideLoading();
    
    showNotification('AI response saved as content card!', 'success');
    
    // Close modal and refresh content list
    const modalOverlay = document.querySelector('.modal-overlay');
    if (modalOverlay) modalOverlay.remove();
    window.loadContentList();
    
    // Navigate to new content after a brief delay
    setTimeout(() => {
      window.viewContent(newContent.id);
    }, 500);
  } catch (error) {
    hideLoading();
    showNotification('Failed to save response: ' + error.message, 'error');
  }
};

window.clearChatHistory = async (id) => {
  if (!confirm('Are you sure you want to clear the chat history? This cannot be undone.')) return;
  
  try {
    showLoading();
    await api.request(`/api/content/${id}/clear-chat`, {
      method: 'POST'
    });
    hideLoading();
    
    showNotification('Chat history cleared', 'success');
    
    // Refresh the modal to show empty chat
    const modalOverlay = document.querySelector('.modal-overlay');
    if (modalOverlay) modalOverlay.remove();
    window.viewContent(id);
  } catch (error) {
    hideLoading();
    showNotification('Failed to clear chat: ' + error.message, 'error');
  }
};

window.deleteContent = async (id) => {
  if (!confirm('Are you sure you want to delete this content?')) return;
  
  try {
    showLoading();
    await api.deleteContent(id);
    hideLoading();
    showNotification('Content deleted successfully', 'success');
    window.loadContentList();
  } catch (error) {
    hideLoading();
    showNotification('Failed to delete content: ' + error.message, 'error');
  }
};
