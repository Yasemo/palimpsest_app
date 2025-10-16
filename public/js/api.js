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
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }

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

  async chatWithContent(id, message) {
    return this.request(`/api/content/${id}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message }),
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

  // Integrations
  async getIntegrationStatus() {
    return this.request('/api/integrations/status');
  }
}

export const api = new API();
