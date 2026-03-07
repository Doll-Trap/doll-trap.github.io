// ============================================================
//  Doll Trap Admin — admin.js
// ============================================================

const API_URL = 'https://doll-trap-github-io.onrender.com/api';
const API_ORIGIN = API_URL.replace('/api', '');
let authToken = localStorage.getItem('authToken');
let dashboardShown = false;

// ── State ────────────────────────────────────────────────────
let allEventsData = [];
let allPhotosData = [];
let currentPhotoEventFilter = 'all';
let editingPhotoId = null;
let editingEventId = null;
let editingEventKind = 'event';
const EVENT_CATEGORY_OPTIONS = [
  'Live', 'Performance', 'Community Event',
  'Convention', 'Workshop', 'Collaboration', 'Other'
];

// ── Bootstrap ────────────────────────────────────────────────
if (authToken) {
  showDashboard();
  verifyToken();
}

// ── Auth ─────────────────────────────────────────────────────
async function verifyToken() {
  try {
    const response = await fetch(`${API_URL}/auth/verify`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (response.status === 401) {
      localStorage.removeItem('authToken');
      authToken = null;
      dashboardShown = false;
      document.getElementById('dashboard').classList.add('hidden');
      document.getElementById('loginForm').classList.remove('hidden');
      document.getElementById('logoutBtn').classList.add('hidden');
      return;
    }

    if (response.ok) {
      showDashboard();
    }
  } catch (error) {
    console.error('Token verification error:', error);
  }
}

document.getElementById('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    authToken = data.token;
    localStorage.setItem('authToken', authToken);
    showDashboard();
  } catch (error) {
    showMessage('authError', error.message, 'error');
  }
});

// Logout — navbar button (hidden but kept for safety) + sidebar button
document.getElementById('logoutBtn').addEventListener('click', doLogout);
document.getElementById('sidebarLogoutBtn').addEventListener('click', doLogout);

function doLogout() {
  localStorage.removeItem('authToken');
  authToken = null;
  closeAccountSettingsModal();
  location.reload();
}

// ── Change Password ───────────────────────────────────────────
document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmNewPassword = document.getElementById('confirmNewPassword').value;

  if (newPassword !== confirmNewPassword) {
    showMessage('passwordMessage', 'New passwords do not match', 'error');
    return;
  }
  if (newPassword.length < 8) {
    showMessage('passwordMessage', 'New password must be at least 8 characters long', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    if (response.status === 401) {
      localStorage.removeItem('authToken');
      authToken = null;
      throw new Error('Session expired or current password is incorrect');
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update password');

    document.getElementById('changePasswordForm').reset();
    showMessage('passwordMessage', 'Password updated successfully', 'success');
  } catch (error) {
    showMessage('passwordMessage', error.message, 'error');
  }
});

// ── Events: Create / Edit ─────────────────────────────────────
document.getElementById('eventForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const isEditing = editingEventId !== null;
  const eventKind = document.getElementById('eventKind').value || editingEventKind || 'event';

  const dateValue = document.getElementById('eventDate').value;
  const timeValue = document.getElementById('eventTime').value;
  const endTimeValue = document.getElementById('eventEndTime').value;

  if (eventKind === 'event' && !dateValue) {
    showMessage('eventMessage', 'Date required for events', 'error');
    return;
  }

  let dateString = null;
  if (dateValue && timeValue) {
    dateString = `${dateValue}T${timeValue}`;
  } else if (dateValue) {
    dateString = `${dateValue}T00:00:00`;
  }

  const submitBtn = document.getElementById('eventSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    // Upload poster if a file was selected
    let imageUrl = document.getElementById('eventImage').value || null;
    const posterFile = document.getElementById('posterFileInput').files[0];
    if (posterFile) {
      const posterFormData = new FormData();
      posterFormData.append('poster', posterFile);
      const uploadRes = await fetch(`${API_URL}/events/upload-poster`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` },
        body: posterFormData
      });
      if (!uploadRes.ok) {
        const err = await parseApiError(uploadRes, 'Poster upload failed');
        throw new Error(err);
      }
      const uploadData = await uploadRes.json();
      imageUrl = uploadData.url;
    }

    const event = {
      title: document.getElementById('eventTitle').value,
      description: document.getElementById('eventDescription').value,
      date: dateString ? new Date(dateString).toISOString() : null,
      end_time: endTimeValue || null,
      location: document.getElementById('eventLocation').value,
      image_url: imageUrl,
      event_category: eventKind === 'event' ? document.getElementById('eventCategory').value : null,
      kind: eventKind
    };

    const response = await fetch(
      isEditing ? `${API_URL}/events/${editingEventId}` : `${API_URL}/events`,
      {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(event)
      }
    );

    if (response.status === 401) {
      localStorage.removeItem('authToken');
      authToken = null;
      throw new Error('Session expired. Please login again.');
    }
    if (!response.ok) {
      const errorMessage = await parseApiError(
        response,
        isEditing ? 'Failed to update event' : 'Failed to create event'
      );
      throw new Error(errorMessage);
    }

    showMessage('eventMessage', isEditing ? 'Event updated!' : 'Event created!', 'success');
    resetEventFormMode();
    loadEvents();
  } catch (error) {
    showMessage('eventMessage', error.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = isEditing ? 'Save Event' : 'Create Event';
  }
});

document.getElementById('eventCancelEditBtn').addEventListener('click', () => {
  resetEventFormMode();
});

// ── Poster upload helpers ─────────────────────────────────────
document.getElementById('posterFileInput').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('posterPreview').src = e.target.result;
    document.getElementById('posterPreviewWrap').style.display = 'block';
    document.getElementById('posterUploadArea').style.display = 'none';
    document.getElementById('eventImage').value = '';
  };
  reader.readAsDataURL(file);
});

function clearPosterUpload() {
  document.getElementById('posterFileInput').value = '';
  document.getElementById('posterPreviewWrap').style.display = 'none';
  document.getElementById('posterUploadArea').style.display = 'block';
}

function onPosterUrlInput() {
  const url = document.getElementById('eventImage').value.trim();
  if (url) clearPosterUpload();
}

// ── Photos: Upload ────────────────────────────────────────────
document.getElementById('photoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const files = document.getElementById('photoInput').files;

  if (files.length === 0) {
    showMessage('photoMessage', 'Please select photos', 'error');
    return;
  }

  const uploadBtn = document.getElementById('uploadPhotosBtn');
  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Uploading...';

  const eventId = document.getElementById('photoEvent').value;
  let uploadedCount = 0;

  for (let file of files) {
    const formData = new FormData();
    formData.append('photo', file);
    if (eventId) formData.append('event_id', eventId);

    const memberTag = document.getElementById('photoMember').value;
    formData.append('member_tag', memberTag || 'Group');

    const caption = document.getElementById('photoCaption').value;
    if (caption) formData.append('caption', caption);

    try {
      const response = await fetch(`${API_URL}/photos`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` },
        body: formData
      });

      if (response.status === 401) throw new Error('Session expired. Please login again.');
      if (!response.ok) {
        const errorMessage = await parseApiError(response, 'Upload failed');
        throw new Error(errorMessage);
      }

      const result = await response.json();
      assertPersistentPhotoUpload(result);
      uploadedCount += 1;
      console.log('Photo uploaded successfully:', result);
    } catch (error) {
      showMessage('photoMessage', error.message, 'error');
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload Photos';
      if (error.message.includes('Session expired')) {
        localStorage.removeItem('authToken');
        authToken = null;
        setTimeout(() => location.reload(), 2000);
      }
      return;
    }
  }

  uploadBtn.disabled = false;
  uploadBtn.textContent = 'Upload Photos';
  showMessage('photoMessage', `${uploadedCount} photo(s) uploaded to persistent storage!`, 'success');
  document.getElementById('photoForm').reset();
  await loadPhotos();
});

// ── Photos: Create Album ──────────────────────────────────────
document.getElementById('createFolderBtn').addEventListener('click', async () => {
  const input = document.getElementById('newFolderName');
  const name = input.value.trim();

  if (!name) {
    showMessage('photoMessage', 'Please enter an album name', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        title: name,
        description: '',
        date: null,
        location: null,
        image_url: null,
        event_category: null,
        kind: 'album'
      })
    });

    if (response.status === 401) {
      localStorage.removeItem('authToken');
      authToken = null;
      throw new Error('Session expired. Please login again.');
    }
    if (!response.ok) {
      const errorMessage = await parseApiError(response, 'Failed to create album');
      throw new Error(errorMessage);
    }

    const album = await response.json();
    input.value = '';
    await loadEvents();
    document.getElementById('photoEvent').value = album.id;
    showMessage('photoMessage', `Album "${album.title}" created`, 'success');
  } catch (error) {
    showMessage('photoMessage', error.message, 'error');
  }
});

// ── Drag & Drop Upload ────────────────────────────────────────
const uploadArea = document.getElementById('uploadArea');
const photoInput = document.getElementById('photoInput');

photoInput.addEventListener('change', (e) => {
  const files = e.target.files;
  if (files.length > 0) {
    const fileNames = Array.from(files).map(f => f.name).join(', ');
    let fileInfo = document.getElementById('fileInfo');
    if (!fileInfo) {
      fileInfo = document.createElement('div');
      fileInfo.id = 'fileInfo';
      uploadArea.appendChild(fileInfo);
    }
    fileInfo.innerHTML = `
      <p style="color:#4ade80;font-weight:bold;margin-bottom:10px;">✅ ${files.length} file(s) selected:</p>
      <p style="font-size:12px;color:#94a3b8;margin:5px 0;">${fileNames}</p>
    `;
  }
});

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.style.background = 'rgba(217,70,166,0.2)';
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.style.background = '';
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  document.getElementById('photoInput').files = e.dataTransfer.files;
  uploadArea.style.background = '';

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const fileNames = Array.from(files).map(f => f.name).join(', ');
    uploadArea.innerHTML = `
      <p>✅ ${files.length} file(s) selected:</p>
      <p style="font-size:12px;color:#94a3b8;margin-top:5px;">${fileNames}</p>
      <input type="file" id="photoInput" multiple accept="image/*">
    `;
  }
});

uploadArea.addEventListener('click', () => {
  document.getElementById('photoInput').click();
});

// ── Event Kind UI Sync ────────────────────────────────────────
document.getElementById('eventKind').addEventListener('change', (e) => {
  syncEventKindUI(e.target.value);
});

function syncEventKindUI(kind) {
  editingEventKind = kind === 'album' ? 'album' : 'event';

  const isAlbum = editingEventKind === 'album';
  document.getElementById('eventCategoryGroup').style.display = isAlbum ? 'none' : 'block';
  document.getElementById('eventDateGroup').style.display   = 'block';
  document.getElementById('eventTimeGroup').style.display   = isAlbum ? 'none' : 'block';
  document.getElementById('eventEndTimeGroup').style.display = isAlbum ? 'none' : 'block';
  document.getElementById('eventDateHint').textContent =
    isAlbum ? '(leave empty to keep as album)' : '(required for events)';
  document.getElementById('eventKind').value = editingEventKind;

  const submitButton = document.getElementById('eventSubmitBtn');
  if (editingEventId !== null) {
    submitButton.textContent = isAlbum ? 'Save Album' : 'Save Event';
  } else {
    submitButton.textContent = isAlbum ? 'Create Album' : 'Create Event';
  }
}

// ── Sidebar & Panel toggle ────────────────────────────────────
function switchSection(section, clickedBtn) {
  document.getElementById('eventsSection').classList.remove('active');
  document.getElementById('photosSection').classList.remove('active');

  document.querySelectorAll('.sidebar-nav-btn').forEach(btn => btn.classList.remove('active'));

  document.getElementById(section + 'Section').classList.add('active');
  if (clickedBtn) clickedBtn.classList.add('active');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}

function togglePanel(panel) {
  panel.classList.toggle('collapsed');
}

// ── Load Events ───────────────────────────────────────────────
async function loadEvents() {
  try {
    const response = await fetch(`${API_URL}/events`);
    const events = await response.json();
    allEventsData = events;

    // Populate photo-upload event dropdown
    const select = document.getElementById('photoEvent');
    const currentValue = select.value;
    select.innerHTML = '<option value="">No Event/Album</option>';
    events.forEach(event => {
      const icon = getEventKind(event) === 'album' ? '📁' : '📅';
      select.innerHTML += `<option value="${event.id}">${icon} ${event.title}</option>`;
    });
    select.value = currentValue;

    // Populate edit-photo event dropdown
    const editEventSelect = document.getElementById('editPhotoEvent');
    const currentEditEventValue = editEventSelect.value;
    editEventSelect.innerHTML = '<option value="">No Event/Album</option>';
    events.forEach(event => {
      const icon = getEventKind(event) === 'album' ? '📁' : '📅';
      editEventSelect.innerHTML += `<option value="${event.id}">${icon} ${event.title}</option>`;
    });
    editEventSelect.value = currentEditEventValue;

    filterEvents('all');
    await loadPhotos();
  } catch (error) {
    console.error('Error loading events:', error);
  }
}

// ── Filter Events ─────────────────────────────────────────────
function filterEvents(type) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  let filteredEvents = allEventsData;

  if (type === 'upcoming') {
    filteredEvents = allEventsData.filter(event => {
      if (getEventKind(event) !== 'event' || !event.date) return false;
      const d = new Date(event.date);
      d.setHours(0, 0, 0, 0);
      return d >= now;
    });
  } else if (type === 'past') {
    filteredEvents = allEventsData.filter(event => {
      if (getEventKind(event) !== 'event' || !event.date) return false;
      const d = new Date(event.date);
      d.setHours(0, 0, 0, 0);
      return d < now;
    });
  }

  document.getElementById('filterAll').style.background      = type === 'all'      ? 'var(--blue)' : '#94a3b8';
  document.getElementById('filterUpcoming').style.background = type === 'upcoming' ? 'var(--blue)' : '#94a3b8';
  document.getElementById('filterPast').style.background     = type === 'past'     ? 'var(--blue)' : '#94a3b8';

  const allList = document.getElementById('allEventsList');
  if (filteredEvents.length === 0) {
    allList.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">No events</p>';
  } else {
    allList.innerHTML = filteredEvents.map(event => {
      const eventDate = event.date ? new Date(event.date) : null;
      const eventType = getEventTypeLabel(event);
      const isPast = getEventKind(event) === 'event' && eventDate && eventDate < now;

      return `
        <div class="list-item">
          <div class="list-item-info">
            <h4>${event.title} <span style="font-size:11px;color:#94a3b8;font-weight:normal;">· ${eventType}</span></h4>
            <p style="margin:5px 0;">${event.date ? new Date(event.date).toLocaleString() : '<strong>TBD</strong>'}</p>
            ${getStoredEventCategory(event) ? `<p style="margin:5px 0;font-size:11px;color:#94a3b8;">🏷️ ${getStoredEventCategory(event)}</p>` : ''}
            ${event.location ? `<p style="margin:5px 0;font-size:11px;color:#94a3b8;">📍 ${event.location}</p>` : ''}
            <p style="font-size:11px;color:#64748b;margin-top:8px;">${event.description || 'No description'}</p>
            ${isPast ? '<p style="font-size:10px;color:#ef4444;margin-top:5px;"><strong>PAST EVENT</strong></p>' : ''}
          </div>
          <div style="display:flex;gap:5px;flex-direction:column;">
            <button onclick="editEvent(${event.id})" style="background:var(--blue);border:none;color:white;padding:8px 12px;border-radius:5px;cursor:pointer;white-space:nowrap;">Edit</button>
            <button onclick="deleteEvent(${event.id})" style="background:#ef4444;border:none;color:white;padding:8px 12px;border-radius:5px;cursor:pointer;white-space:nowrap;">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  }
}

// ── Load & Display Photos ─────────────────────────────────────
async function loadPhotos() {
  try {
    console.log('Loading photos...');
    const response = await fetch(`${API_URL}/photos`);
    const photos = await response.json();
    console.log('Photos loaded:', photos);
    allPhotosData = photos;

    const tabsContainer = document.getElementById('photoEventTabs');
    tabsContainer.innerHTML = `<button class="photo-tab-btn active" onclick="filterPhotosByEvent('all', this)">All Collections</button>`;

    const unassigned = photos.filter(p => !p.event_id);
    if (unassigned.length > 0) {
      tabsContainer.innerHTML += `<button class="photo-tab-btn" onclick="filterPhotosByEvent('unassigned', this)">🗂️ Unassigned (${unassigned.length})</button>`;
    }

    allEventsData.forEach(event => {
      const eventPhotos = photos.filter(p => String(p.event_id) === String(event.id));
      if (eventPhotos.length > 0) {
        const icon = getEventKind(event) === 'album' ? '📁' : '📅';
        tabsContainer.innerHTML += `<button class="photo-tab-btn" onclick="filterPhotosByEvent('event-${event.id}', this)">${icon} ${event.title} (${eventPhotos.length})</button>`;
      }
    });

    displayPhotos(photos);
  } catch (error) {
    console.error('Error loading photos:', error);
  }
}

function filterPhotosByEvent(folderKey, button) {
  currentPhotoEventFilter = folderKey;
  document.querySelectorAll('.photo-tab-btn').forEach(btn => btn.classList.remove('active'));
  if (button) button.classList.add('active');

  let filtered = allPhotosData;
  if (folderKey !== 'all') {
    if (String(folderKey).startsWith('event-')) {
      const eventId = String(folderKey).replace('event-', '');
      filtered = allPhotosData.filter(p => String(p.event_id) === eventId);
    } else if (folderKey === 'unassigned') {
      filtered = allPhotosData.filter(p => !p.event_id);
    }
  }
  displayPhotos(filtered);
}

function displayPhotos(photos) {
  const grid = document.getElementById('photosGrid');

  if (photos.length === 0) {
    grid.innerHTML = '<p style="text-align:center;color:#999;grid-column:1/-1;padding:20px;">No photos</p>';
    return;
  }

  const eventMap = {};
  allEventsData.forEach(event => { eventMap[event.id] = event; });

  grid.innerHTML = photos.map(photo => {
    const photoUrl = photo.photo_url.startsWith('http')
      ? photo.photo_url
      : `${API_ORIGIN}${photo.photo_url}`;
    return `
      <div class="photo-thumbnail">
        <img src="${photoUrl}" alt="${photo.caption || 'Photo'}" onclick="window.open('${photoUrl}')">
        <button class="photo-thumbnail-edit" onclick="openEditPhotoModal(${photo.id})">✎</button>
        <button class="photo-thumbnail-delete" onclick="deletePhoto(${photo.id})">×</button>
        <div class="photo-thumbnail-info">
          ${photo.event_id
            ? `<div>${getEventKind(eventMap[photo.event_id] || {}) === 'album' ? '📁' : '📅'} ${(eventMap[photo.event_id] && eventMap[photo.event_id].title) || 'Event/Album'}</div>`
            : '<div>🗂️ Unassigned</div>'}
          ${photo.member_tag ? `<div>👤 ${photo.member_tag}</div>` : ''}
          ${photo.caption ? `<div>${photo.caption}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ── Edit Photo Modal ──────────────────────────────────────────
function openEditPhotoModal(photoId) {
  const photo = allPhotosData.find(p => p.id === photoId);
  if (!photo) return;

  editingPhotoId = photoId;
  document.getElementById('editPhotoCaption').value = photo.caption || '';
  document.getElementById('editPhotoMember').value = photo.member_tag || 'Group';
  document.getElementById('editPhotoEvent').value = photo.event_id || '';
  document.getElementById('editPhotoModal').classList.add('active');
}

function closeEditPhotoModal() {
  document.getElementById('editPhotoModal').classList.remove('active');
  editingPhotoId = null;
}

document.getElementById('editPhotoForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const updatedData = {
    caption: document.getElementById('editPhotoCaption').value || null,
    member_tag: document.getElementById('editPhotoMember').value,
    event_id: document.getElementById('editPhotoEvent').value || null
  };

  try {
    const response = await fetch(`${API_URL}/photos/${editingPhotoId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(updatedData)
    });

    if (response.status === 401) {
      localStorage.removeItem('authToken');
      authToken = null;
      throw new Error('Session expired. Please login again.');
    }
    if (!response.ok) {
      const errorMessage = await parseApiError(response, 'Failed to update photo');
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const photoIndex = allPhotosData.findIndex(p => p.id === editingPhotoId);
    if (photoIndex !== -1) allPhotosData[photoIndex] = result;

    closeEditPhotoModal();
    showMessage('photoMessage', 'Photo updated!', 'success');
    loadPhotos();
  } catch (error) {
    console.error('Error updating photo:', error);
    alert('Error: ' + error.message);
  }
});

// Close modal on backdrop click
document.getElementById('editPhotoModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('editPhotoModal')) closeEditPhotoModal();
});

// ── Account Settings Modal ────────────────────────────────────
function closeAccountSettingsModal() {
  document.getElementById('accountSettingsModal').classList.remove('active');
}

document.getElementById('accountSettingsModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('accountSettingsModal')) closeAccountSettingsModal();
});

// ── Edit Event ────────────────────────────────────────────────
function editEvent(id) {
  fetch(`${API_URL}/events`)
    .then(r => r.json())
    .then(events => {
      const event = events.find(e => e.id === id);
      if (!event) return;

      editingEventId = id;
      editingEventKind = getEventKind(event);
      syncEventKindUI(editingEventKind);

      document.getElementById('eventTitle').value = event.title;
      document.getElementById('eventDescription').value = event.description || '';
      document.getElementById('eventCategory').value = getStoredEventCategory(event) || 'Live';

      if (event.date) {
        const dateObj = new Date(event.date);
        document.getElementById('eventDate').value = dateObj.toISOString().slice(0, 10);
        document.getElementById('eventTime').value = dateObj.toISOString().slice(11, 16);
      } else {
        document.getElementById('eventDate').value = '';
        document.getElementById('eventTime').value = '';
      }

      document.getElementById('eventEndTime').value = event.end_time ? event.end_time.slice(0, 5) : '';
      document.getElementById('eventLocation').value = event.location || '';
      document.getElementById('eventImage').value = event.image_url || '';

      if (event.image_url) {
        document.getElementById('posterPreview').src = event.image_url;
        document.getElementById('posterPreviewWrap').style.display = 'block';
        document.getElementById('posterUploadArea').style.display = 'none';
      } else {
        clearPosterUpload();
      }

      document.getElementById('eventCancelEditBtn').classList.remove('hidden');

      // Switch to Events section, expand panel, scroll to it
      const eventsBtn = document.querySelector('.sidebar-nav-btn:first-child');
      switchSection('events', eventsBtn);

      const createPanel = document.getElementById('createEventPanel');
      if (createPanel && createPanel.classList.contains('collapsed')) {
        createPanel.classList.remove('collapsed');
      }
      if (createPanel) createPanel.scrollIntoView({ behavior: 'smooth' });
    });
}

function resetEventFormMode() {
  editingEventId = null;
  document.getElementById('eventForm').reset();
  document.getElementById('eventCancelEditBtn').classList.add('hidden');
  clearPosterUpload();
  syncEventKindUI('event');
}

// ── Delete Event / Photo ──────────────────────────────────────
async function deleteEvent(id) {
  const targetEvent = allEventsData.find(e => e.id === id);
  const label = targetEvent ? getEventTypeLabel(targetEvent).toLowerCase() : 'event';
  if (!confirm(`Delete this ${label}?`)) return;
  try {
    const response = await fetch(`${API_URL}/events/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!response.ok) throw new Error('Failed to delete');
    loadEvents();
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

async function deletePhoto(id) {
  if (!confirm('Delete this photo?')) return;
  try {
    const response = await fetch(`${API_URL}/photos/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!response.ok) throw new Error('Failed to delete');
    loadPhotos();
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

// ── Show Dashboard ────────────────────────────────────────────
function showDashboard() {
  if (dashboardShown) return;
  dashboardShown = true;
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  document.getElementById('accountSettingsBtn').classList.remove('hidden');
  document.getElementById('logoutBtn').classList.add('hidden');
  document.getElementById('sidebarLogoutBtn').classList.remove('hidden');
  loadEvents();
}

// ── Helpers ───────────────────────────────────────────────────
function showMessage(elementId, message, type) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.className = `alert ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

function normalizeEventCategory(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  return EVENT_CATEGORY_OPTIONS.find(o => o.toLowerCase() === normalized) || null;
}

function getStoredEventCategory(event) {
  const direct = normalizeEventCategory(event?.event_category || event?.category);
  if (direct) return direct;
  const prefix = event?.description?.split(/\s[-–—]\s/)[0]?.trim();
  return normalizeEventCategory(prefix);
}

function getEventKind(event) {
  return event.kind || (event.date ? 'event' : 'album');
}

function getEventTypeLabel(event) {
  return getEventKind(event) === 'album' ? 'Album' : 'Event';
}

async function parseApiError(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return data.error || data.message || fallbackMessage;
    }
    const rawText = await response.text();
    if (!rawText) return fallbackMessage;
    const cleaned = rawText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return cleaned ? `${fallbackMessage}: ${cleaned.slice(0, 140)}` : fallbackMessage;
  } catch (_) {
    return fallbackMessage;
  }
}

function assertPersistentPhotoUpload(photo) {
  if (!photo || typeof photo.photo_url !== 'string' || !photo.photo_url.trim()) {
    throw new Error('Upload completed but the server did not return a valid photo URL.');
  }
  if (photo.photo_url.startsWith('/uploads/')) {
    throw new Error('Upload fallback detected: server returned a local /uploads path instead of a persistent Supabase URL. Please redeploy the backend and verify Supabase env vars on Render.');
  }
}

// ── Init ──────────────────────────────────────────────────────
syncEventKindUI('event');
