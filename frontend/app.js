const API_URL = 'http://localhost:3000/api';
let socket = null;

// Auth Check
if (!localStorage.getItem('token')) {
  window.location.href = 'index.html';
}

const token = localStorage.getItem('token');
const userId = localStorage.getItem('userId');
const userEmail = localStorage.getItem('userEmail');

// Helper: make authenticated API calls, auto-logout on 401
async function apiFetch(url, options = {}) {
  options.headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };
  const response = await fetch(url, options);
  if (response.status === 401) {
    localStorage.clear();
    window.location.href = 'index.html';
    throw new Error('Session expired');
  }
  return response;
}

// Update UI with user info
document.getElementById('user-email').textContent = userEmail;
document.getElementById('user-id-display').textContent = 'ID: ' + userId.substring(0, 8) + '...';
document.getElementById('full-user-id').textContent = userId;
document.getElementById('sidebar-user-id').textContent = 'ID: ' + userId;

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const section = item.dataset.section;
    
    // Update active nav
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    item.classList.add('active');
    
    // Update active section
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(section + '-section').classList.add('active');
    
    // Update title
    const titles = {
      'send': 'Send Notification',
      'notifications': 'All Notifications',
      'preferences': 'Preferences',
      'realtime': 'Real-time Monitor'
    };
    document.getElementById('section-title').textContent = titles[section];
    
    // Load data when switching sections
    if (section === 'notifications') {
      loadNotifications();
    } else if (section === 'preferences') {
      loadPreferences();
    }
  });
});

// Logout
function logout() {
  localStorage.clear();
  window.location.href = 'index.html';
}

// Use Self ID helper
function useSelfId() {
  document.getElementById('recipient-id').value = userId;
}

// Copy User ID to clipboard
function copyUserId(event) {
  navigator.clipboard.writeText(userId).then(() => {
    // Visual feedback
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = '✓ Copied!';
    btn.style.background = 'rgba(16, 185, 129, 0.3)';
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.style.background = 'rgba(255,255,255,0.2)';
    }, 2000);
  }).catch(err => {
    alert('Failed to copy: ' + err);
  });
}

// Send Notification Form
document.getElementById('send-notification-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const recipientId = document.getElementById('recipient-id').value.trim();
  const type = document.getElementById('notification-type').value;
  const title = document.getElementById('notification-title').value;
  const message = document.getElementById('notification-message').value;
  const metadataText = document.getElementById('notification-metadata').value.trim();
  
  const emailChecked = document.getElementById('channel-email').checked;
  const inappChecked = document.getElementById('channel-inapp').checked;
  
  if (!emailChecked && !inappChecked) {
    showResult('send-result', 'Please select at least one delivery channel', 'error');
    return;
  }
  
  const channels = [];
  if (emailChecked) channels.push('email');
  if (inappChecked) channels.push('inapp');
  
  let metadata = {};
  if (metadataText) {
    try {
      const parsed = JSON.parse(metadataText);
      metadata = parsed;
    } catch (err) {
      showResult('send-result', 'Invalid JSON in metadata field', 'error');
      return;
    }
  }
  
  try {
    const response = await apiFetch(`${API_URL}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: recipientId,
        type,
        title,
        message,
        channels,
        metadata
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showResult('send-result', `Notification sent successfully! ID: ${data.notificationId}`, 'success');
      // Reset form
      e.target.reset();
      document.getElementById('channel-inapp').checked = true;
    } else {
      showResult('send-result', data.error || 'Failed to send notification', 'error');
    }
  } catch (error) {
    showResult('send-result', 'Network error: ' + error.message, 'error');
  }
});

// Load Notifications
async function loadNotifications() {
  const container = document.getElementById('notifications-list');
  container.innerHTML = '<p style="text-align: center; color: #6b7280;">Loading...</p>';
  
  try {
    const response = await apiFetch(`${API_URL}/notifications/${userId}`);
    
    const data = await response.json();
    
    if (response.ok && data.notifications.length > 0) {
      container.innerHTML = data.notifications.map(notif => `
        <div class="notification-item ${notif.is_read ? 'read' : ''}">
          <div class="notification-header">
            <div class="notification-title">${notif.title || 'Notification'}</div>
            <div class="notification-time">${new Date(notif.created_at).toLocaleString()}</div>
          </div>
          <div class="notification-body">${notif.message || notif.body || 'No message'}</div>
          ${notif.type ? `<span class="notification-type type-${notif.type}">${notif.type}</span>` : ''}
          <div class="notification-meta">
            ID: ${notif.id} | Status: ${notif.status} | Read: ${notif.is_read ? 'Yes' : 'No'}
          </div>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<div class="empty-state"><p>No notifications found</p></div>';
    }
  } catch (error) {
    container.innerHTML = '<div class="empty-state"><p style="color: #dc2626;">Error loading notifications</p></div>';
  }
}

// Load Preferences
async function loadPreferences() {
  try {
    const response = await apiFetch(`${API_URL}/preferences/${userId}`);
    
    const data = await response.json();
    
    if (response.ok) {
      document.getElementById('pref-email').checked = data.emailEnabled;
      document.getElementById('pref-inapp').checked = data.inappEnabled;
      document.getElementById('quiet-start').value = data.quietHoursStart || '';
      document.getElementById('quiet-end').value = data.quietHoursEnd || '';
      document.getElementById('pref-email-address').value = data.emailAddress || '';
    }
  } catch (error) {
    console.error('Error loading preferences:', error);
  }
}

// Save Preferences
document.getElementById('preferences-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const preferences = {
    emailEnabled: document.getElementById('pref-email').checked,
    inappEnabled: document.getElementById('pref-inapp').checked,
    quietHoursStart: document.getElementById('quiet-start').value || null,
    quietHoursEnd: document.getElementById('quiet-end').value || null,
    emailAddress: document.getElementById('pref-email-address').value || null
  };
  
  try {
    const response = await apiFetch(`${API_URL}/preferences/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preferences)
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showResult('preferences-result', 'Preferences saved successfully!', 'success');
    } else {
      showResult('preferences-result', data.error || 'Failed to save preferences', 'error');
    }
  } catch (error) {
    showResult('preferences-result', 'Network error: ' + error.message, 'error');
  }
});

// WebSocket Connection
function connectWebSocket() {
  if (socket && socket.connected) {
    alert('Already connected');
    return;
  }
  
  socket = io('http://localhost:3000', {
    auth: { userId }
  });
  
  socket.on('connect', () => {
    updateWSStatus(true);
    addRealtimeLog('CONNECTED', `Socket ID: ${socket.id}`, 'success');
  });
  
  socket.on('disconnect', () => {
    updateWSStatus(false);
    addRealtimeLog('DISCONNECTED', 'Connection closed', 'error');
  });
  
  socket.on('new_notification', (data) => {
    addRealtimeLog('NEW NOTIFICATION', JSON.stringify(data, null, 2), 'info');
    addRealtimeNotification(data);
  });
  
  socket.on('unread-count', (data) => {
    addRealtimeLog('UNREAD COUNT', `Count: ${data.count}`, 'info');
  });
  
  socket.on('error', (error) => {
    addRealtimeLog('ERROR', error, 'error');
  });
}

function disconnectWebSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    addRealtimeLog('DISCONNECT', 'User initiated disconnect', 'info');
  }
}

function updateWSStatus(connected) {
  const badge = document.getElementById('ws-status');
  badge.textContent = connected ? 'Connected' : 'Disconnected';
  badge.className = 'status-badge ' + (connected ? 'connected' : 'disconnected');
}

function addRealtimeLog(label, message, type) {
  const container = document.getElementById('realtime-notifications');
  const time = new Date().toLocaleTimeString();
  
  const colors = {
    'success': '#059669',
    'error': '#dc2626',
    'info': '#1e40af'
  };
  
  const logEntry = document.createElement('div');
  logEntry.style.cssText = `
    padding: 12px;
    margin-bottom: 8px;
    background: #f9fafb;
    border-left: 3px solid ${colors[type] || '#6b7280'};
    border-radius: 4px;
    font-size: 0.85rem;
  `;
  logEntry.innerHTML = `
    <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 4px;">${time}</div>
    <div style="font-weight: 600; color: ${colors[type]}; margin-bottom: 4px;">[${label}]</div>
    <div style="color: #4b5563; white-space: pre-wrap; font-family: monospace;">${message}</div>
  `;
  
  container.insertBefore(logEntry, container.firstChild);
}

function addRealtimeNotification(data) {
  const container = document.getElementById('realtime-notifications');
  const time = new Date().toLocaleTimeString();
  
  const notif = document.createElement('div');
  notif.className = 'notification-item';
  notif.innerHTML = `
    <div class="notification-header">
      <div class="notification-title">${data.title || 'New Notification'}</div>
      <div class="notification-time">${time}</div>
    </div>
    <div class="notification-body">${data.message || data.body || 'No message content'}</div>
    <div class="notification-meta">ID: ${data.id || 'N/A'} | Type: ${data.type || 'unknown'}</div>
  `;
  
  container.insertBefore(notif, container.firstChild);
}

// Helper function
function showResult(elementId, message, type) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.className = 'result-message ' + type;
  
  setTimeout(() => {
    el.className = 'result-message';
    el.textContent = '';
  }, 5000);
}

// Load Socket.io
const script = document.createElement('script');
script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
document.head.appendChild(script);
