import { api } from '../api.js';
import { showLoading, hideLoading, showNotification, showModal, hideModal } from '../router.js';

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

  loadContent();
}

async function loadContent() {
  try {
    showLoading();
    const content = await api.getContent();
    hideLoading();

    const container = document.getElementById('content-grid');
    if (content.length === 0) {
      container.innerHTML = '<div class="empty-state">No content yet. Execute queries and process info packages to generate content!</div>';
      return;
    }

    container.innerHTML = content.map(item => `
      <div class="content-card" onclick="window.viewContent(${item.id})">
        <div class="content-preview">
          ${(item.edited_content || item.content).substring(0, 200)}...
        </div>
        <div class="content-meta">
          <span class="content-date">${new Date(item.created_at).toLocaleDateString()}</span>
          <button class="btn-sm btn-danger" onclick="event.stopPropagation(); window.deleteContent(${item.id})">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    hideLoading();
    showNotification('Failed to load content: ' + error.message, 'error');
  }
}

window.viewContent = async (id) => {
  try {
    showLoading();
    const item = await api.getContentItem(id);
    hideLoading();

    const content = item.edited_content || item.content;
    const chatHistory = item.chat_history || [];

    const modalContent = `
      <div class="content-viewer">
        <div class="content-text">
          <textarea id="content-editor" rows="15">${content}</textarea>
          <button class="btn-primary" onclick="window.saveContentEdit(${id})">Save Edits</button>
        </div>

        <div class="content-chat">
          <h3>AI Chat Editor</h3>
          <div class="chat-history" id="chat-history">
            ${chatHistory.map(msg => `
              <div class="chat-message chat-${msg.role}">
                <strong>${msg.role}:</strong> ${msg.content}
              </div>
            `).join('')}
          </div>
          <div class="chat-input">
            <input type="text" id="chat-message" placeholder="Ask AI to edit..." onkeypress="if(event.key==='Enter') window.sendChatMessage(${id})" />
            <button class="btn-sm" onclick="window.sendChatMessage(${id})">Send</button>
          </div>
        </div>
      </div>
    `;

    showModal('Content Editor', modalContent);
  } catch (error) {
    hideLoading();
    showNotification('Failed to load content: ' + error.message, 'error');
  }
};

window.saveContentEdit = async (id) => {
  const edited_content = document.getElementById('content-editor').value;
  
  try {
    showLoading();
    await api.updateContent(id, { edited_content });
    hideLoading();
    showNotification('Content saved successfully', 'success');
    hideModal();
    loadContent();
  } catch (error) {
    hideLoading();
    showNotification('Failed to save content: ' + error.message, 'error');
  }
};

window.sendChatMessage = async (id) => {
  const message = document.getElementById('chat-message').value;
  if (!message) return;

  try {
    document.getElementById('chat-message').value = '';
    showLoading();
    const result = await api.chatWithContent(id, message);
    hideLoading();

    // Update content editor with AI response
    document.getElementById('content-editor').value = result.response;

    // Add to chat history
    const chatHistory = document.getElementById('chat-history');
    chatHistory.innerHTML += `
      <div class="chat-message chat-user">
        <strong>user:</strong> ${message}
      </div>
      <div class="chat-message chat-assistant">
        <strong>assistant:</strong> ${result.response}
      </div>
    `;
    chatHistory.scrollTop = chatHistory.scrollHeight;
  } catch (error) {
    hideLoading();
    showNotification('Failed to send message: ' + error.message, 'error');
  }
};

window.deleteContent = async (id) => {
  if (!confirm('Are you sure you want to delete this content?')) return;
  
  try {
    showLoading();
    await api.deleteContent(id);
    hideLoading();
    showNotification('Content deleted successfully', 'success');
    loadContent();
  } catch (error) {
    hideLoading();
    showNotification('Failed to delete content: ' + error.message, 'error');
  }
};
