const labels = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

const list = document.querySelector('#incident-list');
const filters = document.querySelector('#filters');
const dialog = document.querySelector('#create-dialog');
const createForm = document.querySelector('#create-form');
const errorBanner = document.querySelector('#error-banner');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message ?? `Request failed with status ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

function showError(error) {
  errorBanner.textContent = error instanceof Error ? error.message : 'Unexpected request failure';
  errorBanner.hidden = false;
}

function hideError() {
  errorBanner.hidden = true;
}

async function loadDashboard() {
  const dashboard = await api('/api/dashboard');
  document.querySelector('#metric-total').textContent = dashboard.total;
  document.querySelector('#metric-open').textContent = dashboard.open;
  document.querySelector('#metric-overdue').textContent = dashboard.overdue;
  document.querySelector('#metric-closed').textContent = dashboard.closed;
  document.querySelector('#metric-average').textContent =
    dashboard.averageResolutionHours === null ? '—' : `${dashboard.averageResolutionHours}h`;
}

function statusOptions(current) {
  return ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']
    .map(
      (status) =>
        `<option value="${status}" ${status === current ? 'selected' : ''}>${labels[status]}</option>`,
    )
    .join('');
}

function renderIncidents(payload) {
  document.querySelector('#result-count').textContent =
    `${payload.pagination.total} incident${payload.pagination.total === 1 ? '' : 's'}`;
  if (payload.items.length === 0) {
    list.innerHTML =
      '<tr><td colspan="6" class="empty-state">No incidents match these filters.</td></tr>';
    return;
  }
  list.innerHTML = payload.items
    .map(
      (incident) => `
        <tr>
          <td class="incident-title">
            <strong>${escapeHtml(incident.title)}</strong>
            <span>${escapeHtml(incident.description)}</span>
          </td>
          <td>
            <span class="badge priority-${incident.priority.toLowerCase()}">
              ${labels[incident.priority]}
            </span>
          </td>
          <td>
            <select class="status-select" data-incident-id="${incident.id}" aria-label="Update status for ${escapeHtml(incident.title)}">
              ${statusOptions(incident.status)}
            </select>
          </td>
          <td>${escapeHtml(incident.assignee ?? 'Unassigned')}</td>
          <td class="${incident.isOverdue ? 'overdue' : ''}">
            ${formatDate(incident.slaDeadline)}
            <span class="deadline-note">${incident.isOverdue ? 'Overdue' : 'Within SLA'}</span>
          </td>
          <td>${formatDate(incident.createdAt)}</td>
        </tr>`,
    )
    .join('');
}

async function loadIncidents() {
  hideError();
  const query = new URLSearchParams();
  for (const [key, value] of new FormData(filters).entries()) {
    if (String(value).trim()) query.set(key, String(value).trim());
  }
  try {
    renderIncidents(await api(`/api/incidents?${query.toString()}`));
  } catch (error) {
    showError(error);
  }
}

async function refresh() {
  await Promise.all([loadDashboard(), loadIncidents()]);
}

filters.addEventListener('submit', (event) => {
  event.preventDefault();
  void loadIncidents();
});

document.querySelector('#clear-filters').addEventListener('click', () => {
  filters.reset();
  void loadIncidents();
});

list.addEventListener('change', async (event) => {
  const select = event.target.closest('.status-select');
  if (!select) return;
  select.disabled = true;
  try {
    await api(`/api/incidents/${select.dataset.incidentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: select.value }),
    });
    await refresh();
  } catch (error) {
    showError(error);
    select.disabled = false;
  }
});

document.querySelector('#open-create').addEventListener('click', () => dialog.showModal());
document.querySelector('#close-create').addEventListener('click', () => dialog.close());
document.querySelector('#cancel-create').addEventListener('click', () => dialog.close());

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(createForm);
  const assignee = String(form.get('assignee') ?? '').trim();
  try {
    await api('/api/incidents', {
      method: 'POST',
      body: JSON.stringify({
        title: form.get('title'),
        description: form.get('description'),
        priority: form.get('priority'),
        assignee: assignee || null,
      }),
    });
    createForm.reset();
    dialog.close();
    await refresh();
  } catch (error) {
    showError(error);
  }
});

void refresh().catch(showError);
