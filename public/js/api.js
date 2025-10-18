// API Client for Palimpsest
const API_BASE_URL = window.location.origin;

class API {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);

      // Check response status first before trying to parse JSON
      if (!response.ok) {
        let errorMsg = `Request failed with status ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch {
          // Response has no JSON body, use status text
          errorMsg = response.statusText || errorMsg;
        }
        throw new Error(errorMsg);
      }

      // Only parse JSON if response is ok
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Sources
  async getSources() {
    return this.request('/api/sources');
  }

  async getSource(id) {
    return this.request(`/api/sources/${id}`);
  }

  async createSource(data) {
    return this.request('/api/sources', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSource(id, data) {
    return this.request(`/api/sources/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteSource(id) {
    return this.request(`/api/sources/${id}`, {
      method: 'DELETE',
    });
  }

  async executeSource(id) {
    return this.request(`/api/sources/${id}/execute`, {
      method: 'POST',
    });
  }

  async getSourceResults(id, limit = 50) {
    return this.request(`/api/sources/${id}/results?limit=${limit}`);
  }

  // Airtable Integration
  async getAirtableBases() {
    return this.request('/api/integrations/airtable/bases');
  }

  async getAirtableTables(baseId) {
    return this.request(`/api/integrations/airtable/bases/${baseId}/tables`);
  }

  async getAirtableTableSchema(baseId, tableId) {
    return this.request(`/api/integrations/airtable/bases/${baseId}/tables/${tableId}/schema`);
  }

  // Queries
  async getQueries() {
    return this.request('/api/queries');
  }

  async getQuery(id) {
    return this.request(`/api/queries/${id}`);
  }

  async createQuery(data) {
    return this.request('/api/queries', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateQuery(id, data) {
    return this.request(`/api/queries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteQuery(id) {
    return this.request(`/api/queries/${id}`, {
      method: 'DELETE',
    });
  }

  async executeQuery(id) {
    return this.request(`/api/queries/${id}/execute`, {
      method: 'POST',
    });
  }

  async getInfoPackages(id, limit = 50) {
    return this.request(`/api/queries/${id}/packages?limit=${limit}`);
  }

  async getAllInfoPackages(limit = 50, offset = 0) {
    return this.request(`/api/info-packages?limit=${limit}&offset=${offset}`);
  }

  async getInfoPackage(id) {
    return this.request(`/api/info-packages/${id}`);
  }

  async createInfoPackage(data) {
    return this.request('/api/info-packages', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateInfoPackage(id, data) {
    return this.request(`/api/info-packages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteInfoPackage(id) {
    return this.request(`/api/info-packages/${id}`, {
      method: 'DELETE',
    });
  }

  // AI
  async getAIConfig() {
    return this.request('/api/ai/config');
  }

  async updateAIConfig(data) {
    return this.request('/api/ai/config', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getAIModels() {
    return this.request('/api/ai/models');
  }

  async getOpenRouterCredits() {
    return this.request('/api/ai/credits');
  }

  async processInfoPackage(packageId) {
    return this.request(`/api/ai/process/${packageId}`, {
      method: 'POST',
    });
  }

  // Content
  async getContent(filters = {}) {
    const params = new URLSearchParams(filters);
    return this.request(`/api/content?${params}`);
  }

  async getContentItem(id) {
    return this.request(`/api/content/${id}`);
  }

  async updateContent(id, data) {
    return this.request(`/api/content/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteContent(id) {
    return this.request(`/api/content/${id}`, {
      method: 'DELETE',
    });
  }

  async chatWithContent(id, message, currentContent, model) {
    return this.request(`/api/content/${id}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message, currentContent, model }),
    });
  }

  async saveContentVariant(id, content) {
    return this.request(`/api/content/${id}/save-variant`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  // Outputs
  async getOutputs() {
    return this.request('/api/outputs');
  }

  async getOutput(id) {
    return this.request(`/api/outputs/${id}`);
  }

  async createOutput(data) {
    return this.request('/api/outputs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateOutput(id, data) {
    return this.request(`/api/outputs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteOutput(id) {
    return this.request(`/api/outputs/${id}`, {
      method: 'DELETE',
    });
  }

  async executeOutput(id) {
    return this.request(`/api/outputs/${id}/execute`, {
      method: 'POST',
    });
  }

  async getOutputLogs(id, limit = 50) {
    return this.request(`/api/outputs/${id}/logs?limit=${limit}`);
  }

  async getOutputTags(outputId) {
    return this.request(`/api/outputs/${outputId}/tags`);
  }

  async setOutputTags(outputId, tagIds) {
    return this.request(`/api/outputs/${outputId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag_ids: tagIds }),
    });
  }

  async previewOutputContent(tagIds, cutoffDays) {
    return this.request('/api/outputs/preview', {
      method: 'POST',
      body: JSON.stringify({ tag_ids: tagIds, cutoff_days: cutoffDays }),
    });
  }

  // Tags
  async getTags() {
    return this.request('/api/tags');
  }

  async createTag(data) {
    return this.request('/api/tags', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getQueryTags(queryId) {
    return this.request(`/api/queries/${queryId}/tags`);
  }

  async setQueryTags(queryId, tagIds) {
    return this.request(`/api/queries/${queryId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag_ids: tagIds }),
    });
  }

  async getInfoPackageTags(packageId) {
    return this.request(`/api/info-packages/${packageId}/tags`);
  }

  async setInfoPackageTags(packageId, tagIds) {
    return this.request(`/api/info-packages/${packageId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag_ids: tagIds }),
    });
  }

  async getContentTags(contentId) {
    return this.request(`/api/content/${contentId}/tags`);
  }

  async setContentTags(contentId, tagIds) {
    return this.request(`/api/content/${contentId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag_ids: tagIds }),
    });
  }

  // Integrations
  async getIntegrationStatus() {
    return this.request('/api/integrations/status');
  }
}

export const api = new API();
