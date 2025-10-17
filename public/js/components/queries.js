import { api } from '../api.js';
import { showLoading, hideLoading, showNotification } from '../router.js';
import Modal, { confirm } from './modal.js';
import { TagInput, renderTagBadges } from './tags.js';

let currentQueries = [];
let currentSources = [];
let currentInfoPackages = [];
let packagesPollingInterval = null;

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
    
    <!-- Query Search and Filter Controls -->
    <div class="queries-controls" style="margin-bottom: 1.5rem; display: flex; gap: 1rem; flex-wrap: wrap;">
      <input 
        type="text" 
        id="query-search" 
        class="form-control" 
        placeholder="Search by batch name..."
        style="flex: 1; min-width: 250px;"
      >
      <select id="query-filter-status" class="form-control" style="width: 150px;">
        <option value="">All Status</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
      <button id="clear-query-filters" class="btn-sm">Clear Filters</button>
    </div>
    
    <div id="queries-list" class="queries-grid">
      <div class="loading-text">Loading queries...</div>
    </div>
    
    <!-- Query Pagination -->
    <div class="query-pagination-controls" style="display: flex; justify-content: center; align-items: center; gap: 1rem; margin-top: 1.5rem; margin-bottom: 2rem;">
      <button id="prev-query-page" class="btn-sm" disabled>← Previous</button>
      <span id="query-page-info" class="text-muted">Page 1</span>
      <button id="next-query-page" class="btn-sm">Next →</button>
    </div>

    <!-- Info Packages Section -->
    <div class="section-header" style="margin-top: 2rem;">
      <h3>Info Packages</h3>
      <p class="text-muted">Information packages generated from query executions</p>
    </div>
    
    <!-- Search and Filter Controls -->
    <div class="packages-controls" style="margin-bottom: 1.5rem; display: flex; gap: 1rem; flex-wrap: wrap;">
      <input 
        type="text" 
        id="package-search" 
        class="form-control" 
        placeholder="Search by query name..."
        style="flex: 1; min-width: 250px;"
      >
      <select id="package-filter-query" class="form-control" style="width: 200px;">
        <option value="">All Queries</option>
      </select>
      <select id="package-filter-status" class="form-control" style="width: 150px;">
        <option value="">All Status</option>
        <option value="processed">Processed</option>
        <option value="pending">Pending</option>
      </select>
      <button id="clear-filters" class="btn-sm">Clear Filters</button>
    </div>
    
    <div id="packages-grid" class="info-packages-grid">
      <div class="loading-text">Loading packages...</div>
    </div>
    
    <!-- Pagination -->
    <div class="pagination-controls" style="display: flex; justify-content: center; align-items: center; gap: 1rem; margin-top: 2rem;">
      <button id="prev-page" class="btn-sm" disabled>← Previous</button>
      <span id="page-info" class="text-muted">Page 1</span>
      <button id="next-page" class="btn-sm">Next →</button>
    </div>
  `;

  document.getElementById('create-query-btn').addEventListener('click', () => showQueryModal());
  
  await Promise.all([
    loadSources(),
    loadQueries(),
    loadAllPackages()
  ]);

  setupFilters();
  setupPagination();
  startPackagesPolling();
}

function startPackagesPolling() {
  // Clear any existing interval
  if (packagesPollingInterval) {
    clearInterval(packagesPollingInterval);
  }
  
  // Store last seen content ID
  let lastSeenContentId = null;
  
  // Poll for new packages and content every 30 seconds
  packagesPollingInterval = setInterval(async () => {
    try {
      const latestPackages = await api.getAllInfoPackages(1000, 0);
      
      // Check if there are new packages
      const hasNewPackages = latestPackages.length > 0 && 
        (!currentInfoPackages.length || latestPackages[0].id !== currentInfoPackages[0]?.id);
      
      if (hasNewPackages) {
        const newPackage = latestPackages[0];
        const queryName = newPackage.query_name || 'Query';
        
        // Check if this package was auto-processed (has processed=true immediately)
        if (newPackage.processed) {
          // This was likely auto-processed! Show special notification
          showNotification(`✨ "${queryName}" executed and content auto-generated!`, 'success');
        } else {
          // Regular package notification
          showNotification(`Query batch "${queryName}" completed successfully!`, 'success');
        }
        
        // Show visual feedback
        const header = document.querySelector('.section-header h3');
        if (header && header.textContent.includes('Info Packages')) {
          header.style.animation = 'pulse 0.5s ease-in-out';
          setTimeout(() => {
            if (header) header.style.animation = '';
          }, 500);
        }
      }
      
      // Update packages and re-apply filters
      allPackages = latestPackages;
      currentInfoPackages = latestPackages.slice(0, 5);
      applyFilters();
    } catch (error) {
      console.error('Failed to poll for packages:', error);
    }
  }, 30000); // 30 seconds
}

// Clean up polling when leaving the page
export function cleanupQueries() {
  if (packagesPollingInterval) {
    clearInterval(packagesPollingInterval);
    packagesPollingInterval = null;
  }
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
    allQueries = currentQueries;
    hideLoading();
    setupQueryFilters();
    setupQueryPagination();
    applyQueryFilters();
  } catch (error) {
    hideLoading();
    showNotification('Failed to load queries: ' + error.message, 'error');
  }
}

function setupQueryFilters() {
  // Add event listeners for query filters
  document.getElementById('query-search').addEventListener('input', (e) => {
    queriesSearchTerm = e.target.value.toLowerCase();
    currentQueriesPage = 0;
    applyQueryFilters();
  });

  document.getElementById('query-filter-status').addEventListener('change', (e) => {
    queriesFilterStatus = e.target.value;
    currentQueriesPage = 0;
    applyQueryFilters();
  });

  document.getElementById('clear-query-filters').addEventListener('click', () => {
    queriesSearchTerm = '';
    queriesFilterStatus = '';
    document.getElementById('query-search').value = '';
    document.getElementById('query-filter-status').value = '';
    currentQueriesPage = 0;
    applyQueryFilters();
  });
}

function applyQueryFilters() {
  filteredQueries = allQueries.filter(query => {
    // Search filter
    if (queriesSearchTerm && !query.name?.toLowerCase().includes(queriesSearchTerm)) {
      return false;
    }

    // Status filter
    if (queriesFilterStatus === 'active' && !query.active) {
      return false;
    }
    if (queriesFilterStatus === 'inactive' && query.active) {
      return false;
    }

    return true;
  });

  renderQueriesList();
}

function setupQueryPagination() {
  document.getElementById('prev-query-page').addEventListener('click', () => {
    if (currentQueriesPage > 0) {
      currentQueriesPage--;
      renderQueriesList();
    }
  });

  document.getElementById('next-query-page').addEventListener('click', () => {
    currentQueriesPage++;
    renderQueriesList();
  });
}

// Pagination and filtering for packages
let currentPackagesPage = 0;
const packagesPerPage = 9; // 3x3 grid
let allPackages = [];
let filteredPackages = [];
let packagesSearchTerm = '';
let packagesFilterQuery = '';
let packagesFilterStatus = '';

// Pagination and filtering for queries
let currentQueriesPage = 0;
const queriesPerPage = 4; // 2x2 grid
let allQueries = [];
let filteredQueries = [];
let queriesSearchTerm = '';
let queriesFilterStatus = '';

async function loadAllPackages() {
  try {
    showLoading();
    // Load a large number to get all packages (adjust if needed)
    const packages = await api.getAllInfoPackages(1000, 0);
    allPackages = packages;
    currentInfoPackages = packages.slice(0, 5); // Store first 5 for polling comparison
    hideLoading();
    applyFilters();
  } catch (error) {
    hideLoading();
    document.getElementById('packages-grid').innerHTML = 
      '<div class="empty-state">Failed to load packages</div>';
  }
}

function setupFilters() {
  // Populate query filter dropdown
  const queryFilter = document.getElementById('package-filter-query');
  const uniqueQueries = [...new Set(allPackages.map(pkg => pkg.query_name))].filter(Boolean);
  uniqueQueries.forEach(queryName => {
    const option = document.createElement('option');
    option.value = queryName;
    option.textContent = queryName;
    queryFilter.appendChild(option);
  });

  // Add event listeners
  document.getElementById('package-search').addEventListener('input', (e) => {
    packagesSearchTerm = e.target.value.toLowerCase();
    currentPackagesPage = 0;
    applyFilters();
  });

  document.getElementById('package-filter-query').addEventListener('change', (e) => {
    packagesFilterQuery = e.target.value;
    currentPackagesPage = 0;
    applyFilters();
  });

  document.getElementById('package-filter-status').addEventListener('change', (e) => {
    packagesFilterStatus = e.target.value;
    currentPackagesPage = 0;
    applyFilters();
  });

  document.getElementById('clear-filters').addEventListener('click', () => {
    packagesSearchTerm = '';
    packagesFilterQuery = '';
    packagesFilterStatus = '';
    document.getElementById('package-search').value = '';
    document.getElementById('package-filter-query').value = '';
    document.getElementById('package-filter-status').value = '';
    currentPackagesPage = 0;
    applyFilters();
  });
}

function applyFilters() {
  filteredPackages = allPackages.filter(pkg => {
    // Search filter
    if (packagesSearchTerm && !pkg.query_name?.toLowerCase().includes(packagesSearchTerm)) {
      return false;
    }

    // Query filter
    if (packagesFilterQuery && pkg.query_name !== packagesFilterQuery) {
      return false;
    }

    // Status filter
    if (packagesFilterStatus === 'processed' && !pkg.processed) {
      return false;
    }
    if (packagesFilterStatus === 'pending' && pkg.processed) {
      return false;
    }

    return true;
  });

  renderPackagesGrid();
}

async function renderPackagesGrid() {
  const container = document.getElementById('packages-grid');
  const start = currentPackagesPage * packagesPerPage;
  const end = start + packagesPerPage;
  const pagePackages = filteredPackages.slice(start, end);

  if (filteredPackages.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No info packages found</p>
        <p class="text-muted">Try adjusting your filters</p>
      </div>
    `;
    updatePaginationControls();
    return;
  }

  // Load tags for all packages in parallel
  const packagesWithTags = await Promise.all(
    pagePackages.map(async (pkg) => {
      try {
        const tags = await api.getInfoPackageTags(pkg.id);
        return { ...pkg, tags };
      } catch (error) {
        console.error(`Failed to load tags for package ${pkg.id}:`, error);
        return { ...pkg, tags: [] };
      }
    })
  );

  container.innerHTML = packagesWithTags.map(pkg => {
    const data = typeof pkg.data === 'string' ? JSON.parse(pkg.data) : pkg.data;
    const summary = data.executionSummary || {};
    
    return `
      <div class="card info-package-card">
        <div class="card-header">
          <h4>${escapeHtml(pkg.query_name || 'Unknown Query')}</h4>
          <span class="badge badge-success">
            Complete
          </span>
        </div>
        
        <div class="card-body">
          <div class="package-summary">
            <div class="summary-item">
              <span class="label">Created:</span>
              <span class="value">${formatFullDate(pkg.created_at)}</span>
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
          ${pkg.tags && pkg.tags.length > 0 ? `
            <div class="tags-container">
              ${renderTagBadges(pkg.tags)}
            </div>
          ` : ''}
        </div>
        
        <div class="card-actions">
          <button class="btn-sm btn-success" onclick="window.executePackageWithAI(${pkg.id})">
            Execute with AI
          </button>
          <button class="btn-sm btn-primary" onclick="window.viewPackageDetails(${pkg.id})">
            View Details
          </button>
          <button class="btn-sm btn-danger" onclick="window.deletePackage(${pkg.id})">
            Delete
          </button>
        </div>
      </div>
    `;
  }).join('');

  updatePaginationControls();
}

function updatePaginationControls() {
  const totalPages = Math.ceil(filteredPackages.length / packagesPerPage);
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');
  const pageInfo = document.getElementById('page-info');

  prevBtn.disabled = currentPackagesPage === 0;
  nextBtn.disabled = currentPackagesPage >= totalPages - 1 || filteredPackages.length === 0;
  pageInfo.textContent = filteredPackages.length > 0 
    ? `Page ${currentPackagesPage + 1} of ${totalPages}` 
    : 'No results';
}

function setupPagination() {
  document.getElementById('prev-page').addEventListener('click', () => {
    if (currentPackagesPage > 0) {
      currentPackagesPage--;
      renderPackagesGrid();
    }
  });

  document.getElementById('next-page').addEventListener('click', () => {
    currentPackagesPage++;
    renderPackagesGrid();
  });
}

async function renderQueriesList() {
  const container = document.getElementById('queries-list');
  const start = currentQueriesPage * queriesPerPage;
  const end = start + queriesPerPage;
  const pageQueries = filteredQueries.slice(start, end);
  
  if (filteredQueries.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No query batches found</p>
        <p class="text-muted">Try adjusting your filters</p>
      </div>
    `;
    updateQueryPaginationControls();
    return;
  }

  // Load tags for all queries in parallel
  const queriesWithTags = await Promise.all(
    pageQueries.map(async (query) => {
      try {
        const tags = await api.getQueryTags(query.id);
        return { ...query, tags };
      } catch (error) {
        console.error(`Failed to load tags for query ${query.id}:`, error);
        return { ...query, tags: [] };
      }
    })
  );

  container.innerHTML = queriesWithTags.map(query => {
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
          ${query.tags && query.tags.length > 0 ? `
            <div class="tags-container">
              ${renderTagBadges(query.tags)}
            </div>
          ` : ''}
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

  updateQueryPaginationControls();
}

function updateQueryPaginationControls() {
  const totalPages = Math.ceil(filteredQueries.length / queriesPerPage);
  const prevBtn = document.getElementById('prev-query-page');
  const nextBtn = document.getElementById('next-query-page');
  const pageInfo = document.getElementById('query-page-info');

  if (prevBtn) prevBtn.disabled = currentQueriesPage === 0;
  if (nextBtn) nextBtn.disabled = currentQueriesPage >= totalPages - 1 || filteredQueries.length === 0;
  if (pageInfo) {
    pageInfo.textContent = filteredQueries.length > 0 
      ? `Page ${currentQueriesPage + 1} of ${totalPages}` 
      : 'No results';
  }
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
          <span class="badge badge-success">
            Complete
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
              <span class="badge badge-success">
                Complete
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

async function showQueryModal(query = null) {
  const isEdit = !!query;
  const config = query && typeof query.query_config === 'string' 
    ? JSON.parse(query.query_config) 
    : (query?.query_config || { sources: [], schedule: {} });
  
  const schedule = config.schedule || {};
  
  // Load all available tags
  let allTags = [];
  let selectedTagIds = [];
  
  try {
    allTags = await api.getTags();
    
    // Load existing tags if editing
    if (isEdit && query?.id) {
      const existingTags = await api.getQueryTags(query.id);
      selectedTagIds = existingTags.map(t => t.id);
    }
  } catch (error) {
    console.error('Failed to load tags:', error);
  }
  
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
          <h4>Tags</h4>
          <p class="text-muted">Organize and categorize this query batch</p>
          
          ${allTags.length > 10 ? `
            <div class="form-group">
              <input 
                type="text" 
                id="tag-search" 
                class="form-control" 
                placeholder="Search tags..."
                style="margin-bottom: 1rem;"
              >
            </div>
          ` : ''}
          
          <div id="tags-selection" class="tags-selection" style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border-light); border-radius: 2px; padding: 0.5rem; background: var(--bg-secondary);">
            ${allTags.length === 0 ? `
              <div class="empty-state" style="padding: 2rem; text-align: center;">
                <p>No tags available</p>
                <p class="text-muted" style="font-size: 0.875rem;">Tags will appear here once created</p>
              </div>
            ` : allTags.map(tag => `
              <label class="tag-filter-item" data-tag-name="${escapeHtml(tag.name).toLowerCase()}">
                <input 
                  type="checkbox" 
                  name="tags" 
                  value="${tag.id}"
                  ${selectedTagIds.includes(tag.id) ? 'checked' : ''}
                >
                <span class="tag-color-dot" style="background-color: ${tag.color};"></span>
                <span>${escapeHtml(tag.name)}</span>
              </label>
            `).join('')}
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

        <div class="form-group">
          <label class="checkbox-label">
            <input 
              type="checkbox" 
              id="auto-process-ai" 
              name="auto_process_with_ai"
              ${query?.auto_process_with_ai ? 'checked' : ''}
            >
            Automatically execute with AI
          </label>
          <small class="form-text">When enabled, info packages will be immediately processed with AI to generate content cards</small>
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

  // Add tag search functionality if search box exists
  const tagSearchInput = document.getElementById('tag-search');
  if (tagSearchInput) {
    tagSearchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const tagItems = document.querySelectorAll('.tag-filter-item');
      
      tagItems.forEach(item => {
        const tagName = item.getAttribute('data-tag-name');
        if (tagName.includes(searchTerm)) {
          item.style.display = '';
        } else {
          item.style.display = 'none';
        }
      });
    });
  }
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

    // Get selected tags from checkboxes
    const selectedTags = Array.from(form.querySelectorAll('input[name="tags"]:checked'))
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
      active: formData.active,
      auto_process_with_ai: formData.auto_process_with_ai
    };
    
    let savedQuery;
    if (queryId) {
      savedQuery = await api.updateQuery(queryId, queryData);
      showNotification('Query batch updated successfully', 'success');
    } else {
      savedQuery = await api.createQuery(queryData);
      showNotification('Query batch created successfully', 'success');
    }
    
    // Save tags
    const queryIdToUpdate = queryId || savedQuery.id;
    await api.setQueryTags(queryIdToUpdate, selectedTags);
    
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

    if (sourcesCount === 0) {
      showNotification('No sources configured for this query', 'error');
      return;
    }

    // Get source details
    const sources = sourceIds.map(sourceId => 
      currentSources.find(s => s.id === sourceId)
    ).filter(s => s);

    // Show execution progress modal with detailed source tracking
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
                <span class="execution-icon"><i data-feather="clock"></i></span>
                <span class="source-name">${index + 1}. ${escapeHtml(source.name)}</span>
                <span class="execution-status-text">Waiting...</span>
              </div>
            `).join('')}
          </div>
        </div>
      `,
      actions: []
    });

    // Initialize feather icons
    if (window.feather) feather.replace();

    const sourceResults = [];

    try {
      // Execute each source sequentially with real-time UI updates
      for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        const statusItem = progressModal.modalElement.querySelector(`#source-${source.id}`);
        
        // Update UI to show this source is executing
        if (statusItem) {
          statusItem.querySelector('.execution-icon').innerHTML = '<i data-feather="loader"></i>';
          if (window.feather) feather.replace();
          statusItem.querySelector('.execution-status-text').textContent = 'Executing...';
          statusItem.style.fontWeight = 'bold';
        }
        
        try {
          // Execute this source
          const result = await api.executeSource(source.id);
          
          // Extract the integration data from the result
          let integrationData;
          try {
            integrationData = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
          } catch (parseError) {
            console.error(`Failed to parse source result data:`, parseError);
            integrationData = result.data;
          }
          
          // Store the result
          sourceResults.push({
            sourceId: source.id,
            sourceName: source.name,
            sourceType: source.type,
            data: integrationData,
            status: result.status || 'success',
            executedAt: new Date().toISOString()
          });
          
          // Update UI to show success
          if (statusItem) {
            statusItem.querySelector('.execution-icon').innerHTML = '<i data-feather="check-circle"></i>';
            if (window.feather) feather.replace();
            statusItem.querySelector('.execution-status-text').textContent = 'Complete';
            statusItem.style.color = 'var(--success)';
            statusItem.style.fontWeight = 'normal';
          }
        } catch (error) {
          // Store error result
          sourceResults.push({
            sourceId: source.id,
            sourceName: source.name,
            sourceType: source.type,
            data: { error: error.message },
            status: 'error',
            executedAt: new Date().toISOString()
          });
          
          // Update UI to show error
          if (statusItem) {
            statusItem.querySelector('.execution-icon').innerHTML = '<i data-feather="x-circle"></i>';
            if (window.feather) feather.replace();
            statusItem.querySelector('.execution-status-text').textContent = 'Failed';
            statusItem.style.color = 'var(--error)';
            statusItem.style.fontWeight = 'normal';
          }
        }
        
        // Update progress bar
        const progressFill = progressModal.modalElement.querySelector('.progress-fill');
        if (progressFill) {
          const progress = ((i + 1) / sources.length) * 100;
          progressFill.style.width = `${progress}%`;
        }
      }
      
      // All sources executed - now create the info package
      const packageData = {
        sources: sourceResults,
        queryTitle: query.name,
        executionSummary: {
          totalSources: sources.length,
          successCount: sourceResults.filter(r => r.status === 'success').length,
          errorCount: sourceResults.filter(r => r.status === 'error').length,
        }
      };

      // Create info package
      const infoPackage = await api.createInfoPackage({
        query_id: id,
        data: packageData,
        directive: query.directive
      });

      // Copy tags from query to info package
      try {
        const queryTags = await api.getQueryTags(id);
        if (queryTags.length > 0) {
          const tagIds = queryTags.map(tag => tag.id);
          await api.setInfoPackageTags(infoPackage.id, tagIds);
        }
      } catch (tagError) {
        console.error('Failed to copy tags to info package:', tagError);
      }

      // Refresh the packages list
      await loadAllPackages();
      
      // Check if auto-process with AI is enabled
      if (query.auto_process_with_ai) {
        // Close modal immediately
        progressModal.close();
        
        // Show toast notification that processing is starting
        showNotification('Info package created! Processing with AI in background...', 'info');
        
        // Process in background
        try {
          const content = await api.processInfoPackage(infoPackage.id);
          
          // Show success notification (stay on current page)
          showNotification('✨ Content automatically generated! Check the Content tab.', 'success');
          
          return; // Exit early
        } catch (aiError) {
          console.error('Auto-processing failed:', aiError);
          showNotification('Info package created, but AI processing failed: ' + aiError.message, 'error');
          return;
        }
      }
      
      // Close modal after brief delay to show completion
      setTimeout(() => {
        progressModal.close();
        // Show notification with action to view package
        showNotification('Info package created successfully!', 'success');
      }, 1000);
      
    } catch (error) {
      // Update modal with error
      progressModal.modalElement.querySelector('.modal-actions').innerHTML = `
        <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Close</button>
      `;
      
      showNotification('Failed to execute query: ' + error.message, 'error');
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
    
    // Load tags for the package
    let tags = [];
    try {
      tags = await api.getInfoPackageTags(id);
    } catch (error) {
      console.error('Failed to load package tags:', error);
    }
    
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
            ${tags && tags.length > 0 ? `
              <div class="tags-container" style="margin-top: 1rem;">
                ${renderTagBadges(tags)}
              </div>
            ` : ''}
          </div>

          <div class="detail-section">
            <h4>Directive</h4>
            <div class="directive-text">${escapeHtml(pkg.directive)}</div>
          </div>

          <div class="detail-section">
            <h4>Source Results (${sources.length})</h4>
            <div class="sources-results">
              ${sources.map((source, index) => {
                const resultData = source.data || source.result?.data || source.result;
                const content = resultData?.content || 'No content available';
                const citations = resultData?.citations || [];
                const shouldTruncate = content.length > 500;
                const preview = shouldTruncate ? content.substring(0, 500) : content;
                const uniqueId = `source-content-${index}`;
                
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
                        <div class="content-wrapper">
                          <div id="${uniqueId}-preview" style="${shouldTruncate ? '' : 'display: none;'}">
                            <p>${escapeHtml(preview)}...</p>
                          </div>
                          <div id="${uniqueId}-full" style="${shouldTruncate ? 'display: none;' : ''}">
                            <p style="white-space: pre-wrap;">${escapeHtml(content)}</p>
                          </div>
                          ${shouldTruncate ? `
                            <button class="btn-sm btn-link" onclick="window.toggleSourceContent('${uniqueId}', this)">
                              <span class="show-more">Show More</span>
                              <span class="show-less" style="display: none;">Show Less</span>
                            </button>
                          ` : ''}
                          ${citations.length > 0 ? `
                            <div class="result-citations" style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-light);">
                              <strong>Sources:</strong>
                              <ul class="citations-list">
                                ${citations.map((citation, idx) => `
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
    await loadAllPackages();
  } catch (error) {
    hideLoading();
    showNotification('Failed to delete package: ' + error.message, 'error');
  }
};

window.toggleSourceContent = (uniqueId, button) => {
  const previewDiv = document.getElementById(`${uniqueId}-preview`);
  const fullDiv = document.getElementById(`${uniqueId}-full`);
  const showMoreSpan = button.querySelector('.show-more');
  const showLessSpan = button.querySelector('.show-less');
  
  if (previewDiv.style.display === 'none') {
    // Currently showing full, switch to preview
    previewDiv.style.display = '';
    fullDiv.style.display = 'none';
    showMoreSpan.style.display = '';
    showLessSpan.style.display = 'none';
  } else {
    // Currently showing preview, switch to full
    previewDiv.style.display = 'none';
    fullDiv.style.display = '';
    showMoreSpan.style.display = 'none';
    showLessSpan.style.display = '';
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
    
    // Refresh package list
    await loadAllPackages();
    
    // Reopen the package details with updated data
    await window.viewPackageDetails(id);
  } catch (error) {
    modal.setLoading(false);
    showNotification('Failed to update directive: ' + error.message, 'error');
  }
}

window.executePackageWithAI = async (id) => {
  // Find the card element and add processing state
  const cardElement = document.querySelector(`[onclick*="executePackageWithAI(${id})"]`)?.closest('.card');
  if (cardElement) {
    cardElement.classList.add('processing');
    const badge = document.createElement('span');
    badge.className = 'badge badge-processing';
    badge.innerHTML = '<i data-feather="loader"></i> Processing...';
    badge.id = `processing-badge-${id}`;
    cardElement.querySelector('.card-header')?.appendChild(badge);
    if (window.feather) feather.replace();
  }
  
  // Show initial toast (non-blocking)
  showNotification('AI processing started in background...', 'info');
  
  // Process in background without blocking UI (no loading overlay)
  try {
    const result = await api.processInfoPackage(id);
    
    // Dispatch event to refresh credit balance
    document.dispatchEvent(new Event('ai-operation-complete'));
    
    // Remove processing state
    if (cardElement) {
      cardElement.classList.remove('processing');
      const badge = document.getElementById(`processing-badge-${id}`);
      if (badge) badge.remove();
    }
    
    // Show success notification
    const contentId = result.id;
    showNotification('✨ AI processing complete! Content created successfully.', 'success');
    
    // Refresh the packages list to update processed status
    await loadAllPackages();
  } catch (error) {
    // Remove processing state on error
    if (cardElement) {
      cardElement.classList.remove('processing');
      const badge = document.getElementById(`processing-badge-${id}`);
      if (badge) badge.remove();
    }
    showNotification('Failed to process with AI: ' + error.message, 'error');
  }
};

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

function formatFullDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}
