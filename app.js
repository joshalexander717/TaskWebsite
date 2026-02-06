import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js';
import { getFirestore, doc, setDoc, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyBt9xX4tJDSHAE8rrG1BdyCgNq2OwO2_Qg",
  authDomain: "task-website-d5b99.firebaseapp.com",
  projectId: "task-website-d5b99",
  storageBucket: "task-website-d5b99.firebasestorage.app",
  messagingSenderId: "1093815548138",
  appId: "1:1093815548138:web:4a8e6442cf23a827837f93"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();

const calendarA = document.getElementById('calendarA');
const calendarB = document.getElementById('calendarB');
let activeCalendar = calendarA;
const monthLabel = document.getElementById('monthLabel');
const selectedDateLabel = document.getElementById('selectedDateLabel');
const selectedProgressBarFill = document.getElementById('selectedProgressBarFill');
const selectedProgressLabel = document.getElementById('selectedProgressLabel');
const taskList = document.getElementById('taskList');
const taskText = document.getElementById('taskText');
const taskTag = document.getElementById('taskTag');
const eventList = document.getElementById('eventList');
const eventText = document.getElementById('eventText');
const eventTime = document.getElementById('eventTime');
const addEventBtn = document.getElementById('addEvent');
const addTaskBtn = document.getElementById('addTask');
const prevMonthBtn = document.getElementById('prevMonth');
const nextMonthBtn = document.getElementById('nextMonth');
const newTagInput = document.getElementById('newTagInput');
const addTagBtn = document.getElementById('addTagBtn');
const tagList = document.getElementById('tagList');
const tagViewLabel = document.getElementById('tagViewLabel');
const tagViewList = document.getElementById('tagViewList');
const tagViewTabs = document.getElementById('tagViewTabs');
const tagManagerToggle = document.getElementById('tagManagerToggle');
const tagManagerOverlay = document.getElementById('tagManagerOverlay');
const darkModeToggle = document.getElementById('darkModeToggle');
const signInBtn = document.getElementById('signInBtn');
const signOutBtn = document.getElementById('signOutBtn');
const userLabel = document.getElementById('userLabel');
const dayPanel = document.querySelector('.day-panel');
const dayPanelBackdrop = document.getElementById('dayPanelBackdrop');
const closeDayPanelBtn = document.getElementById('closeDayPanel');
const mobileQuery = window.matchMedia('(max-width: 900px)');

const STORAGE_KEY = 'task-calendar-data';
const TAGS_KEY = 'task-calendar-tags';
const DEFAULT_TAG = 'Other';
const EVENTS_VIEW = '__events__';
const THEME_KEY = 'task-calendar-theme';

let viewDate = new Date();
let selectedDate = null;
let tasksByDate = loadLocalTasks();
let tags = loadLocalTags();
let selectedTagView = DEFAULT_TAG;
const completionState = {};
let currentUser = null;
let remoteStateRef = null;
let unsubscribeState = null;
let pendingSave = null;
let isApplyingRemote = false;

syncTagsFromTasks();
setupThemeToggle();
setupAuth();
renderTagOptions();
renderTagManager();
renderTagView();
renderTagViewTabs();
setupTagManagerOverlay();
setupDayPanelSheet();

function loadLocalTasks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (err) {
    return {};
  }
}

function saveLocalTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasksByDate));
}

function saveTasks() {
  saveLocalTasks();
  scheduleRemoteSave();
}

function getDayData(dateKey) {
  const raw = tasksByDate[dateKey];
  if (Array.isArray(raw)) {
    return { tasks: raw, events: [] };
  }
  if (raw && typeof raw === 'object') {
    return {
      tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
      events: Array.isArray(raw.events) ? raw.events : [],
    };
  }
  return { tasks: [], events: [] };
}

function setDayData(dateKey, data) {
  tasksByDate[dateKey] = {
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    events: Array.isArray(data.events) ? data.events : [],
  };
  saveTasks();
}

function loadLocalTags() {
  try {
    const stored = JSON.parse(localStorage.getItem(TAGS_KEY));
    if (Array.isArray(stored) && stored.length) {
      return ensureDefaultTag(stored);
    }
  } catch (err) {
    // ignore
  }
  return [DEFAULT_TAG];
}

function saveLocalTags() {
  localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
}

function setupAuth() {
  if (signInBtn) {
    signInBtn.addEventListener('click', async () => {
      try {
        await signInWithPopup(auth, provider);
      } catch (err) {
        await signInWithRedirect(auth, provider);
      }
    });
  }
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      await signOut(auth);
    });
  }

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (userLabel) {
      userLabel.textContent = user ? `Signed in as ${user.displayName || user.email || 'User'}` : 'Not signed in';
    }
    if (signInBtn) signInBtn.style.display = user ? 'none' : 'inline-flex';
    if (signOutBtn) signOutBtn.style.display = user ? 'inline-flex' : 'none';

    if (unsubscribeState) {
      unsubscribeState();
      unsubscribeState = null;
    }

    if (user) {
      remoteStateRef = doc(db, 'users', user.uid, 'app', 'state');
      unsubscribeState = onSnapshot(remoteStateRef, (snap) => {
        const data = snap.data();
        if (data && data.tasksByDate) {
          isApplyingRemote = true;
          tasksByDate = data.tasksByDate || {};
          tags = ensureDefaultTag(Array.isArray(data.tags) ? data.tags : []);
          syncTagsFromTasks();
          renderTagOptions();
          renderTagManager();
          renderTagViewTabs();
          renderTagView();
          renderCalendar();
          renderTasks();
          isApplyingRemote = false;
        } else {
          // First-time sign-in: seed remote from current local state
          tasksByDate = loadLocalTasks();
          tags = ensureDefaultTag(loadLocalTags());
          syncTagsFromTasks();
          saveRemoteState();
          renderTagOptions();
          renderTagManager();
          renderTagViewTabs();
          renderTagView();
          renderCalendar();
          renderTasks();
        }
      });
    } else {
      remoteStateRef = null;
      // Clear all info on sign out
      tasksByDate = {};
      tags = [DEFAULT_TAG];
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TAGS_KEY);
      renderTagOptions();
      renderTagManager();
      renderTagViewTabs();
      renderTagView();
      renderCalendar();
      renderTasks();
    }
  });
}

getRedirectResult(auth).catch(() => {
  // ignore: redirect flow fallback for popup blockers
});

function saveRemoteState() {
  if (!currentUser || !remoteStateRef || isApplyingRemote) return;
  const payload = sanitizeForFirestore();
  setDoc(remoteStateRef, payload, { merge: true }).catch((err) => {
    console.error('Sync failed', err);
    showToast('Sync failed. Check Firebase settings.');
  });
}

function scheduleRemoteSave() {
  if (!currentUser || isApplyingRemote) return;
  if (pendingSave) {
    clearTimeout(pendingSave);
  }
  pendingSave = setTimeout(() => {
    pendingSave = null;
    saveRemoteState();
  }, 300);
}

function sanitizeForFirestore() {
  const cleanedTasksByDate = {};
  Object.keys(tasksByDate).forEach((dateKey) => {
    const data = getDayData(dateKey);
    const cleanedTasks = data.tasks.map((task) => ({
      text: String(task.text || '').trim(),
      done: Boolean(task.done),
      tag: task.tag || DEFAULT_TAG,
    })).filter((task) => task.text);
    const cleanedEvents = data.events.map((event) => ({
      text: String(event.text || '').trim(),
      time: event.time || '',
    })).filter((event) => event.text);
    cleanedTasksByDate[dateKey] = { tasks: cleanedTasks, events: cleanedEvents };
  });

  const cleanedTags = ensureDefaultTag((tags || []).filter(Boolean));
  return {
    tasksByDate: cleanedTasksByDate,
    tags: cleanedTags,
    updatedAt: serverTimestamp(),
  };
}

function setSelectedProgress(percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  if (selectedProgressBarFill) {
    selectedProgressBarFill.style.width = `${clamped}%`;
  }
}

function setupDayPanelSheet() {
  if (!dayPanel) return;

  const closeSheet = () => {
    if (!mobileQuery.matches) return;
    dayPanel.classList.remove('open');
    if (dayPanelBackdrop) {
      dayPanelBackdrop.classList.remove('open');
      dayPanelBackdrop.setAttribute('aria-hidden', 'true');
    }
  };

  const openSheet = () => {
    if (!mobileQuery.matches) return;
    dayPanel.classList.add('open');
    if (dayPanelBackdrop) {
      dayPanelBackdrop.classList.add('open');
      dayPanelBackdrop.setAttribute('aria-hidden', 'false');
    }
  };

  dayPanel.openSheet = openSheet;
  dayPanel.closeSheet = closeSheet;

  if (closeDayPanelBtn) {
    closeDayPanelBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      closeSheet();
    });
  }

  if (dayPanelBackdrop) {
    dayPanelBackdrop.addEventListener('click', closeSheet);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeSheet();
  });

  mobileQuery.addEventListener('change', () => {
    if (!mobileQuery.matches) {
      dayPanel.classList.remove('open');
      if (dayPanelBackdrop) {
        dayPanelBackdrop.classList.remove('open');
        dayPanelBackdrop.setAttribute('aria-hidden', 'true');
      }
    }
  });
}

function setupThemeToggle() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = saved ? saved === 'dark' : prefersDark;
  document.body.classList.toggle('dark', isDark);
  if (darkModeToggle) {
    darkModeToggle.checked = isDark;
    darkModeToggle.addEventListener('change', () => {
      const nextDark = darkModeToggle.checked;
      document.body.classList.toggle('dark', nextDark);
      localStorage.setItem(THEME_KEY, nextDark ? 'dark' : 'light');
    });
  }
}

function saveTags() {
  saveLocalTags();
  scheduleRemoteSave();
}

function ensureDefaultTag(list) {
  const normalized = list.filter(Boolean);
  if (!normalized.includes(DEFAULT_TAG)) {
    normalized.push(DEFAULT_TAG);
  }
  return normalized;
}

function syncTagsFromTasks() {
  const tagSet = new Set(tags);
  Object.keys(tasksByDate).forEach((dateKey) => {
    const data = getDayData(dateKey);
    data.tasks.forEach((task) => {
      if (task.tag && !tagSet.has(task.tag)) {
        tagSet.add(task.tag);
      }
    });
  });
  tags = ensureDefaultTag(Array.from(tagSet));
  saveTags();
}

function normalizeTag(value) {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_TAG;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function createTagSelect(selectedTag) {
  const select = document.createElement('select');
  select.className = 'task-edit-tag';
  tags.forEach((tag) => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag;
    select.appendChild(option);
  });
  select.value = selectedTag || DEFAULT_TAG;
  return select;
}

function renderTagOptions() {
  if (!taskTag) return;
  taskTag.innerHTML = '';
  tags.forEach((tag) => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag;
    taskTag.appendChild(option);
  });
  taskTag.value = DEFAULT_TAG;
}

function renderTagManager() {
  if (!tagList) return;
  tagList.innerHTML = '';

  tags.forEach((tag) => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.textContent = tag;
    pill.dataset.tag = tag;

    if (tag !== DEFAULT_TAG) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${tag} tag`);
      remove.className = 'tag-remove';
      remove.innerHTML = '<i class="fa-solid fa-x" aria-hidden="true"></i>';
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        removeTag(tag);
      });
      pill.appendChild(remove);
    }

    tagList.appendChild(pill);
  });
}

function renderTagViewTabs() {
  if (!tagViewTabs) return;
  tagViewTabs.innerHTML = '';
  const eventsBtn = document.createElement('button');
  eventsBtn.type = 'button';
  eventsBtn.className = 'tag-view-tab';
  if (selectedTagView === EVENTS_VIEW) {
    eventsBtn.classList.add('active');
  }
  eventsBtn.textContent = 'Events';
  eventsBtn.addEventListener('click', () => {
    selectedTagView = EVENTS_VIEW;
    renderTagViewTabs();
    renderTagView();
  });
  tagViewTabs.appendChild(eventsBtn);

  tags.forEach((tag) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-view-tab';
    if (tag === selectedTagView) {
      btn.classList.add('active');
    }
    btn.textContent = tag;
    btn.addEventListener('click', () => {
      selectedTagView = tag;
      renderTagViewTabs();
      renderTagView();
    });
    tagViewTabs.appendChild(btn);
  });
}

function renderTagView() {
  if (!tagViewList || !tagViewLabel) return;
  tagViewLabel.textContent = selectedTagView === EVENTS_VIEW ? 'Events' : (selectedTagView || DEFAULT_TAG);
  tagViewList.innerHTML = '';

  if (selectedTagView === EVENTS_VIEW) {
    const eventGroups = {};
    Object.keys(tasksByDate).forEach((dateKey) => {
      const data = getDayData(dateKey);
      if (data.events.length) {
        eventGroups[dateKey] = data.events.map((event, index) => ({ event, index }));
      }
    });

    Object.keys(eventGroups)
      .sort((a, b) => a.localeCompare(b))
      .forEach((dateKey) => {
        const header = document.createElement('li');
        header.className = 'tag-view-date-header';
        header.textContent = formatShortDate(dateKey);
        tagViewList.appendChild(header);

        eventGroups[dateKey]
          .sort((a, b) => {
            const at = a.event.time || '99:99';
            const bt = b.event.time || '99:99';
            return at.localeCompare(bt);
          })
          .forEach((entry) => {
            const item = document.createElement('li');
            item.className = 'tag-view-item';

            const row = document.createElement('div');
            row.className = 'tag-view-row';

            const time = document.createElement('span');
            time.className = 'event-time';
            time.textContent = formatTime(entry.event.time);

            const text = document.createElement('span');
            text.className = 'task-text';
            text.textContent = entry.event.text;

            row.append(time, text);

            const actions = document.createElement('div');
            actions.className = 'tag-view-actions';

            const edit = document.createElement('button');
            edit.className = 'task-action edit';
            edit.type = 'button';
            edit.setAttribute('aria-label', 'Rename event');
            edit.innerHTML = '<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>';
            edit.addEventListener('click', () => {
              const input = document.createElement('input');
              input.className = 'task-edit-input';
              input.type = 'text';
              input.value = entry.event.text;
              const timeInput = document.createElement('input');
              timeInput.className = 'task-edit-tag';
              timeInput.type = 'time';
              timeInput.value = entry.event.time || '';
              row.replaceChild(input, text);
              row.replaceChild(timeInput, time);
              input.focus();
              input.select();
              item.classList.add('editing');

              const confirm = document.createElement('button');
              confirm.className = 'task-action confirm';
              confirm.type = 'button';
              confirm.setAttribute('aria-label', 'Confirm edit');
              confirm.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
              actions.appendChild(confirm);

              const commit = () => {
                const next = input.value.trim();
                if (next) {
                  entry.event.text = next;
                  entry.event.time = timeInput.value || '';
                  setEvents(dateKey, getEvents(dateKey));
                }
                item.classList.remove('editing');
                confirm.remove();
                renderTagView();
              };

              confirm.addEventListener('click', (evt) => {
                evt.stopPropagation();
                commit();
              });

              input.addEventListener('blur', commit);
              timeInput.addEventListener('blur', commit);
              input.addEventListener('keydown', (evt) => {
                if (evt.key === 'Enter') commit();
                if (evt.key === 'Escape') renderTagView();
              });
            });

            const remove = document.createElement('button');
            remove.className = 'task-action remove';
            remove.type = 'button';
            remove.setAttribute('aria-label', 'Remove event');
            remove.innerHTML = '<i class="fa-solid fa-x" aria-hidden="true"></i>';
            remove.addEventListener('click', () => {
              const dayEvents = getEvents(dateKey);
              dayEvents.splice(entry.index, 1);
              setEvents(dateKey, dayEvents);
              renderTagView();
              updateDayCard(dateKey);
              renderCalendar();
            });

            actions.append(edit, remove);
            row.appendChild(actions);
            item.append(row);

            item.addEventListener('click', (evt) => {
              const target = evt.target;
              if (target.closest('button') || target.closest('input') || target.closest('select')) {
                return;
              }
              item.classList.toggle('show-actions');
            });

            tagViewList.appendChild(item);
          });
      });

    return;
  }

  const groups = {};
  Object.keys(tasksByDate).forEach((dateKey) => {
    const data = getDayData(dateKey);
    data.tasks.forEach((task, index) => {
      const tag = task.tag || DEFAULT_TAG;
      if (tag === selectedTagView) {
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push({ task, index });
      }
    });
  });

  Object.keys(groups)
    .sort((a, b) => a.localeCompare(b))
    .forEach((dateKey) => {
      const header = document.createElement('li');
      header.className = 'tag-view-date-header';
      header.textContent = formatShortDate(dateKey);
      tagViewList.appendChild(header);

      groups[dateKey].forEach((entry) => {
        const item = document.createElement('li');
        item.className = 'tag-view-item';
        item.textContent = '';

        const row = document.createElement('div');
        row.className = 'tag-view-row';

        const check = document.createElement('button');
        check.className = `task-check${entry.task.done ? ' checked' : ''}`;
        check.type = 'button';
        check.dataset.dateKey = dateKey;
        check.dataset.index = String(entry.index);
        check.setAttribute('aria-label', entry.task.done ? 'Mark incomplete' : 'Mark complete');
        check.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
        check.addEventListener('click', () => {
          entry.task.done = !entry.task.done;
          setTasks(dateKey, getTasks(dateKey));
          check.classList.toggle('checked', entry.task.done);
          check.setAttribute('aria-label', entry.task.done ? 'Mark incomplete' : 'Mark complete');
          text.className = `task-text${entry.task.done ? ' done' : ''}`;
          updateSelectedProgress();
          updateDayCard(dateKey);
          triggerCompletionEffects(dateKey);
          syncDayCheckbox(dateKey, entry.index, entry.task.done);
        });

        const text = document.createElement('span');
        text.className = `task-text${entry.task.done ? ' done' : ''}`;
        text.textContent = entry.task.text;

        row.append(check, text);

        const actions = document.createElement('div');
        actions.className = 'tag-view-actions';

        const edit = document.createElement('button');
        edit.className = 'task-action edit';
        edit.type = 'button';
        edit.setAttribute('aria-label', 'Rename task');
        edit.innerHTML = '<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>';
        edit.addEventListener('click', () => {
          const input = document.createElement('input');
          input.className = 'task-edit-input';
          input.type = 'text';
          input.value = entry.task.text;
          const tagSelect = createTagSelect(entry.task.tag || DEFAULT_TAG);
          tagSelect.addEventListener('click', (event) => event.stopPropagation());
          tagSelect.addEventListener('mousedown', (event) => event.stopPropagation());
          row.replaceChild(input, text);
          row.insertBefore(tagSelect, actions);
          input.focus();
          input.select();
          item.classList.add('editing');

          const confirm = document.createElement('button');
          confirm.className = 'task-action confirm';
          confirm.type = 'button';
          confirm.setAttribute('aria-label', 'Confirm edit');
          confirm.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
          actions.appendChild(confirm);

          const commit = () => {
            const next = input.value.trim();
            if (next) {
              entry.task.text = next;
              entry.task.tag = tagSelect.value || DEFAULT_TAG;
              if (!tags.includes(entry.task.tag)) {
                tags.push(entry.task.tag);
                tags = ensureDefaultTag(tags);
                tags.sort((a, b) => (a === DEFAULT_TAG ? 1 : b === DEFAULT_TAG ? -1 : a.localeCompare(b)));
                saveTags();
                renderTagOptions();
                renderTagManager();
                renderTagViewTabs();
              }
              setTasks(dateKey, getTasks(dateKey));
            }
            item.classList.remove('editing');
            confirm.remove();
            renderTasks();
            renderTagView();
          };

          confirm.addEventListener('click', (event) => {
            event.stopPropagation();
            commit();
          });

          input.addEventListener('blur', (event) => {
            if (event.relatedTarget === tagSelect) return;
            commit();
          });
          input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') renderTagView();
          });
          tagSelect.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') renderTagView();
          });
        });

        const remove = document.createElement('button');
        remove.className = 'task-action remove';
        remove.type = 'button';
        remove.setAttribute('aria-label', 'Remove task');
        remove.innerHTML = '<i class="fa-solid fa-x" aria-hidden="true"></i>';
        remove.addEventListener('click', () => {
          const dayTasks = getTasks(dateKey);
          dayTasks.splice(entry.index, 1);
          setTasks(dateKey, dayTasks);
          renderTasks();
          renderTagView();
          updateDayCard(dateKey);
        });

        actions.append(edit, remove);
        row.appendChild(actions);

        item.append(row);

        item.addEventListener('click', (event) => {
          const target = event.target;
          if (target.closest('button') || target.closest('input') || target.closest('select')) {
            return;
          }
          item.classList.toggle('show-actions');
        });

        tagViewList.appendChild(item);
      });
    });
}


function syncDayCheckbox(dateKey, index, done) {
  if (!selectedDate || formatDateKey(selectedDate) !== dateKey) return;
  const selector = `.task-check[data-date-key="${dateKey}"][data-index="${index}"]`;
  const dayCheck = document.querySelector(selector);
  if (!dayCheck) return;
  dayCheck.classList.remove('checked');
  void dayCheck.offsetWidth;
  if (done) {
    requestAnimationFrame(() => dayCheck.classList.add('checked'));
  }
  dayCheck.setAttribute('aria-label', done ? 'Mark incomplete' : 'Mark complete');
  const dayText = dayCheck.parentElement?.querySelector('.task-text');
  if (dayText) {
    dayText.className = `task-text${done ? ' done' : ''}`;
  }
}

function syncTagViewCheckbox(dateKey, index, done) {
  const selector = `.tag-view-list .task-check[data-date-key="${dateKey}"][data-index="${index}"]`;
  const tagCheck = document.querySelector(selector);
  if (!tagCheck) return;
  tagCheck.classList.remove('checked');
  void tagCheck.offsetWidth;
  if (done) {
    requestAnimationFrame(() => tagCheck.classList.add('checked'));
  }
  tagCheck.setAttribute('aria-label', done ? 'Mark incomplete' : 'Mark complete');
  const tagText = tagCheck.parentElement?.querySelector('.task-text');
  if (tagText) {
    tagText.className = `task-text${done ? ' done' : ''}`;
  }
}

function addTag() {
  if (!newTagInput) return;
  const tagValue = normalizeTag(newTagInput.value);
  if (!tagValue || tags.includes(tagValue)) {
    newTagInput.value = '';
    return;
  }

  tags.push(tagValue);
  tags = ensureDefaultTag(tags);
  tags.sort((a, b) => (a === DEFAULT_TAG ? 1 : b === DEFAULT_TAG ? -1 : a.localeCompare(b)));
  saveTags();
  renderTagOptions();
  renderTagManager();
  renderTagViewTabs();
  newTagInput.value = '';
}

function removeTag(tag) {
  if (tag === DEFAULT_TAG) return;
  tags = tags.filter((t) => t !== tag);
  tags = ensureDefaultTag(tags);

  Object.keys(tasksByDate).forEach((dateKey) => {
    const data = getDayData(dateKey);
    data.tasks.forEach((task) => {
      if (task.tag === tag) {
        task.tag = DEFAULT_TAG;
      }
    });
    setDayData(dateKey, data);
  });

  saveTasks();
  saveTags();
  renderTagOptions();
  renderTagManager();
  renderTagViewTabs();
  renderTasks();
  renderCalendar();
  if (selectedTagView === tag) {
    selectedTagView = DEFAULT_TAG;
  }
  renderTagView();
  renderTagViewTabs();
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatReadable(date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatShortDate(dateKey) {
  const [year, month, day] = dateKey.split('-');
  if (!year || !month || !day) return dateKey;
  return `${month}-${day}-${year.slice(2)}`;
}

function formatTime(value) {
  if (!value) return '';
  const [h, m] = value.split(':');
  if (!h || !m) return value;
  const hour = Number(h);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = ((hour + 11) % 12) + 1;
  return `${hour12}:${m} ${suffix}`;
}

function getMonthDays(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days = [];

  for (let d = 1; d <= last.getDate(); d += 1) {
    days.push(new Date(year, month, d));
  }

  return { first, days };
}

function getTasks(dateKey) {
  return getDayData(dateKey).tasks;
}

function setTasks(dateKey, tasks) {
  const data = getDayData(dateKey);
  data.tasks = tasks;
  setDayData(dateKey, data);
}

function getEvents(dateKey) {
  return getDayData(dateKey).events;
}

function setEvents(dateKey, events) {
  const data = getDayData(dateKey);
  data.events = events;
  setDayData(dateKey, data);
}

function computeProgress(tasks) {
  if (!tasks.length) return 0;
  const done = tasks.filter((task) => task.done).length;
  return Math.round((done / tasks.length) * 100);
}

function getDayTopColor(tasks, progress) {
  const isDark = document.body.classList.contains('dark');
  if (!tasks.length) {
    return isDark ? '#3a342e' : '#faf4ec';
  }

  if (progress >= 100) return isDark ? '#4b6b58' : '#bfe3d0';
  if (progress >= 50) return isDark ? '#6a5b33' : '#f6e3a1';
  return isDark ? '#6b3b3a' : '#f2b8b5';
}

function updateSelectedProgress() {
  if (!selectedDate) {
    setSelectedProgress(0);
    selectedProgressLabel.textContent = '';
    return;
  }

  const dateKey = formatDateKey(selectedDate);
  const tasks = getTasks(dateKey);
  const progress = computeProgress(tasks);
  setSelectedProgress(progress);
  selectedProgressLabel.textContent = `${progress}% complete`;
}

function updateDayCard(dateKey) {
  const card = activeCalendar.querySelector(`[data-date-key="${dateKey}"]`);
  if (!card) {
    renderCalendar(activeCalendar);
    return;
  }

  const tasks = getTasks(dateKey);
  const events = getEvents(dateKey);
  const progress = computeProgress(tasks);
  const meta = card.querySelector('.day-meta');
  const fill = card.querySelector('.progress-fill');
  const count = card.querySelector('.progress-count');
  const completed = tasks.filter((task) => task.done).length;

  card.style.setProperty('--day-top', getDayTopColor(tasks, progress));
  if (meta) {
    const eventLine = events.length
      ? `<span class="meta-icon"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${events.length}</span><br>`
      : `<span class="meta-icon placeholder" aria-hidden="true"><i class="fa-regular fa-clock"></i> 0</span><br>`;
    meta.innerHTML = `${eventLine}<span class="meta-icon"><i class="fa-solid fa-check" aria-hidden="true"></i> ${completed}/${tasks.length}</span>`;
  }
  if (fill) {
    fill.style.width = `${progress}%`;
  }
    if (count) {
      count.textContent = `${completed}/${tasks.length}`;
    }
    if (card) {
      card.style.setProperty('--progress', `${progress}%`);
    }
  }

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function spawnConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti';
  const colors = ['#f6a15b', '#f2b8b5', '#bfe3d0', '#f6e3a1'];
  for (let i = 0; i < 72; i += 1) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${10 + Math.random() * 80}%`;
    piece.style.bottom = `${-10 - Math.random() * 20}px`;
    piece.style.animationDelay = `${Math.random() * 0.2}s`;
    piece.style.setProperty('--rise', `${20 + Math.random() * 50}vh`);

    const drift = document.createElement('div');
    drift.className = 'confetti-drift';
    const driftDir = Math.random() < 0.5 ? -1 : 1;
    drift.style.setProperty('--drift', `${driftDir * (250 + Math.random() * 300)}px`);

    const spin = document.createElement('div');
    spin.className = 'confetti-spin';
    spin.style.background = colors[i % colors.length];
    spin.style.transform = `rotate(${Math.random() * 360}deg)`;

    drift.appendChild(spin);
    piece.appendChild(drift);
    container.appendChild(piece);
  }
  document.body.appendChild(container);
  setTimeout(() => container.remove(), 2400);
}

function playChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => ctx.close();
  } catch (err) {
    // ignore
  }
}

function triggerCompletionEffects(dateKey) {
  const tasks = getTasks(dateKey);
  const progress = computeProgress(tasks);
  const wasComplete = completionState[dateKey] === true;
  const isComplete = tasks.length > 0 && progress === 100;
  completionState[dateKey] = isComplete;

  const card = activeCalendar.querySelector(`[data-date-key="${dateKey}"]`);
  if (card) {
    card.classList.toggle('complete', isComplete);
    let stamp = card.querySelector('.stamp');
    if (!stamp) {
      stamp = document.createElement('div');
      stamp.className = 'stamp';
      stamp.textContent = 'Done';
      card.appendChild(stamp);
    }
    if (!isComplete && stamp) {
      stamp.remove();
    }
  }

  if (isComplete && !wasComplete) {
    showToast('All tasks completed! Great work.');
    spawnConfetti();
    playChime();
    if (selectedProgressBarFill) {
      selectedProgressBarFill.classList.add('shimmer');
    }
    const fill = card?.querySelector('.progress-fill');
    if (fill) {
      fill.classList.add('shimmer');
      setTimeout(() => fill.classList.remove('shimmer'), 1400);
    }
    if (selectedProgressBarFill) {
      setTimeout(() => selectedProgressBarFill.classList.remove('shimmer'), 1400);
    }
  }
}

function renderCalendar(target = activeCalendar) {
  target.innerHTML = '';
  const { first, days } = getMonthDays(viewDate);
  const month = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  monthLabel.textContent = month;

  const startPadding = (first.getDay() + 6) % 7;
  for (let i = 0; i < startPadding; i += 1) {
    const spacer = document.createElement('div');
    spacer.className = 'day-card';
    spacer.style.visibility = 'hidden';
    target.appendChild(spacer);
  }

  days.forEach((date) => {
    const dateKey = formatDateKey(date);
    const tasks = getTasks(dateKey);
    const events = getEvents(dateKey);
    const progress = computeProgress(tasks);
    const completed = tasks.filter((task) => task.done).length;

    const card = document.createElement('div');
    card.className = 'day-card';
    card.dataset.dateKey = dateKey;
    card.style.setProperty('--day-top', getDayTopColor(tasks, progress));
    card.style.setProperty('--progress', `${progress}%`);
    card.style.setProperty('--progress', `${progress}%`);
    const isComplete = tasks.length > 0 && progress === 100;
    completionState[dateKey] = isComplete;
    if (isComplete) {
      card.classList.add('complete');
      const stamp = document.createElement('div');
      stamp.className = 'stamp';
      stamp.textContent = 'Done';
      card.appendChild(stamp);
    }
    if (selectedDate && formatDateKey(selectedDate) === dateKey) {
      card.classList.add('selected');
    }

    const number = document.createElement('div');
    number.className = 'day-number';
    number.textContent = date.getDate();

    const meta = document.createElement('div');
    meta.className = 'day-meta';
    const eventLine = events.length
      ? `<span class="meta-icon"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${events.length}</span><br>`
      : `<span class="meta-icon placeholder" aria-hidden="true"><i class="fa-regular fa-clock"></i> 0</span><br>`;
    meta.innerHTML = `${eventLine}<span class="meta-icon"><i class="fa-solid fa-check" aria-hidden="true"></i> ${completed}/${tasks.length}</span>`;

    const track = document.createElement('div');
    track.className = 'progress-track';

    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.width = `${progress}%`;

    const count = document.createElement('span');
    count.className = 'progress-count';
    count.textContent = `${completed}/${tasks.length}`;

    track.append(fill, count);
    card.append(number, meta, track);

    card.addEventListener('click', () => selectDate(date));
    target.appendChild(card);
  });

  adjustCalendarStageHeight();
}

function adjustCalendarStageHeight() {
  const stage = calendarA?.parentElement;
  if (!stage) return;
  const height = activeCalendar.scrollHeight;
  stage.style.height = `${height}px`;
}

function animateCalendar(direction, nextDate) {
  const outgoing = activeCalendar;
  const incoming = activeCalendar === calendarA ? calendarB : calendarA;
  incoming.classList.add('hidden');
  viewDate = nextDate;
  renderCalendar(incoming);

  outgoing.classList.remove('animate-next', 'animate-prev');
  incoming.classList.remove('animate-next', 'animate-prev');
  void incoming.offsetWidth;
  outgoing.classList.add(direction === 'prev' ? 'exit-prev' : 'exit-next');
  const exitClass = direction === 'prev' ? 'exit-prev' : 'exit-next';
  const enterClass = direction === 'prev' ? 'animate-prev' : 'animate-next';

  const onExitEnd = () => {
    outgoing.removeEventListener('animationend', onExitEnd);
    outgoing.classList.add('hidden');
    outgoing.classList.remove(exitClass);
    outgoing.innerHTML = '';

    incoming.classList.remove('hidden');
    incoming.classList.add(enterClass);
    activeCalendar = incoming;
  };

  outgoing.addEventListener('animationend', onExitEnd, { once: true });
}

function renderTasks(shouldRenderTagView = true) {
  if (!selectedDate) {
    selectedDateLabel.textContent = 'Select a day';
    setSelectedProgress(0);
    selectedProgressLabel.textContent = '';
    taskList.innerHTML = '';
    if (eventList) {
      eventList.innerHTML = '';
    }
    adjustDayPanelHeight();
    return;
  }

  const dateKey = formatDateKey(selectedDate);
  const tasks = getTasks(dateKey);
  const events = getEvents(dateKey);
  const progress = computeProgress(tasks);

  selectedDateLabel.textContent = formatReadable(selectedDate);
  setSelectedProgress(progress);
  selectedProgressLabel.textContent = `${progress}% complete`;
  const activeCard = activeCalendar.querySelector(`[data-date-key="${dateKey}"]`);
  if (activeCard) {
    activeCard.style.setProperty('--progress', `${progress}%`);
  }
  taskList.innerHTML = '';
  if (eventList) {
    eventList.innerHTML = '';
  }

  const groups = tasks.reduce((acc, task, index) => {
    const key = task.tag || DEFAULT_TAG;
    if (!acc[key]) acc[key] = [];
    acc[key].push({ task, index });
    return acc;
  }, {});

  tags
    .filter((tag) => groups[tag])
    .forEach((tagName) => {
      const group = document.createElement('li');
      group.className = 'task-group';

      const title = document.createElement('div');
      title.className = 'task-group-title';
      title.textContent = tagName;
      group.appendChild(title);

      groups[tagName].forEach(({ task, index }) => {
        const item = document.createElement('li');
        item.className = 'task-item';

        const left = document.createElement('div');
        left.className = 'task-left';

        const check = document.createElement('button');
        check.className = `task-check${task.done ? ' checked' : ''}`;
        check.type = 'button';
        check.dataset.dateKey = dateKey;
        check.dataset.index = String(index);
        check.setAttribute('aria-label', task.done ? 'Mark incomplete' : 'Mark complete');
        check.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
        check.addEventListener('click', () => {
          task.done = !task.done;
          setTasks(dateKey, tasks);

          check.classList.toggle('checked', task.done);
          check.setAttribute('aria-label', task.done ? 'Mark incomplete' : 'Mark complete');
          text.className = `task-text${task.done ? ' done' : ''}`;

          updateSelectedProgress();
          updateDayCard(dateKey);
          triggerCompletionEffects(dateKey);
          syncTagViewCheckbox(dateKey, index, task.done);
        });

        const text = document.createElement('span');
        text.className = `task-text${task.done ? ' done' : ''}`;
        text.textContent = task.text;

        left.append(check, text);

        item.addEventListener('click', (event) => {
          const target = event.target;
          if (target.closest('button') || target.closest('input') || target.closest('select')) {
            return;
          }
          item.classList.toggle('show-actions');
        });

        const actions = document.createElement('div');
        actions.className = 'task-actions';

        const edit = document.createElement('button');
        edit.className = 'task-action edit';
        edit.type = 'button';
        edit.setAttribute('aria-label', 'Rename task');
        edit.innerHTML = '<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>';
        edit.addEventListener('click', () => {
          const input = document.createElement('input');
          input.className = 'task-edit-input';
          input.type = 'text';
          input.value = task.text;
          const tagSelect = createTagSelect(task.tag || DEFAULT_TAG);
          tagSelect.addEventListener('click', (event) => event.stopPropagation());
          tagSelect.addEventListener('mousedown', (event) => event.stopPropagation());
          left.replaceChild(input, text);
          left.appendChild(tagSelect);
          input.focus();
          input.select();
          item.classList.add('editing');

          const confirm = document.createElement('button');
          confirm.className = 'task-action confirm';
          confirm.type = 'button';
          confirm.setAttribute('aria-label', 'Confirm edit');
          confirm.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
          actions.appendChild(confirm);

          const commit = () => {
            const next = input.value.trim();
            if (next) {
              task.text = next;
              task.tag = tagSelect.value || DEFAULT_TAG;
              if (!tags.includes(task.tag)) {
                tags.push(task.tag);
                tags = ensureDefaultTag(tags);
                tags.sort((a, b) => (a === DEFAULT_TAG ? 1 : b === DEFAULT_TAG ? -1 : a.localeCompare(b)));
                saveTags();
                renderTagOptions();
                renderTagManager();
                renderTagViewTabs();
              }
              setTasks(dateKey, tasks);
            }
            item.classList.remove('editing');
            confirm.remove();
            renderTasks();
          };

          confirm.addEventListener('click', (event) => {
            event.stopPropagation();
            commit();
          });

          input.addEventListener('blur', (event) => {
            if (event.relatedTarget === tagSelect) return;
            commit();
          });
          input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') renderTasks();
          });
          tagSelect.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') renderTasks();
          });
        });

        const remove = document.createElement('button');
        remove.className = 'task-action remove';
        remove.type = 'button';
        remove.setAttribute('aria-label', 'Remove task');
        remove.innerHTML = '<i class="fa-solid fa-x" aria-hidden="true"></i>';
        remove.addEventListener('click', () => {
          item.classList.add('removing');
          setTimeout(() => {
            tasks.splice(index, 1);
            setTasks(dateKey, tasks);
            renderTasks();
            updateDayCard(dateKey);
          }, 200);
        });

        actions.append(edit, remove);
        item.append(left, actions);
        group.appendChild(item);
      });

      taskList.appendChild(group);
    });

  if (shouldRenderTagView) {
    renderTagView();
  }
  renderEvents(dateKey, events);
  adjustDayPanelHeight();
}

function adjustDayPanelHeight() {
  const panel = document.querySelector('.day-panel');
  if (!panel) return;
  if (mobileQuery.matches) return;
  const start = panel.getBoundingClientRect().height;
  panel.style.height = 'auto';
  const end = panel.scrollHeight;
  panel.style.height = `${start}px`;
  requestAnimationFrame(() => {
    panel.style.height = `${end}px`;
  });
}

function renderEvents(dateKey, events) {
  if (!eventList) return;
  eventList.innerHTML = '';

  const ordered = events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const at = a.event.time || '99:99';
      const bt = b.event.time || '99:99';
      return at.localeCompare(bt);
    });

  ordered.forEach(({ event, index }) => {
    const item = document.createElement('li');
    item.className = 'event-item';

    const time = document.createElement('span');
    time.className = 'event-time';
    time.textContent = formatTime(event.time);

    const text = document.createElement('span');
    text.className = 'event-text';
    text.textContent = event.text;

    const actions = document.createElement('div');
    actions.className = 'event-actions';

    const edit = document.createElement('button');
    edit.className = 'task-action edit';
    edit.type = 'button';
    edit.setAttribute('aria-label', 'Rename event');
    edit.innerHTML = '<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>';
    edit.addEventListener('click', () => {
      const input = document.createElement('input');
      input.className = 'task-edit-input';
      input.type = 'text';
      input.value = event.text;
      const timeInput = document.createElement('input');
      timeInput.className = 'task-edit-tag';
      timeInput.type = 'time';
      timeInput.value = event.time || '';
      item.replaceChild(input, text);
      item.replaceChild(timeInput, time);
      input.focus();
      input.select();
      item.classList.add('editing');

      const confirm = document.createElement('button');
      confirm.className = 'task-action confirm';
      confirm.type = 'button';
      confirm.setAttribute('aria-label', 'Confirm edit');
      confirm.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
      actions.appendChild(confirm);

      const commit = () => {
        const next = input.value.trim();
        if (next) {
          event.text = next;
          event.time = timeInput.value || '';
          setEvents(dateKey, events);
        }
        item.classList.remove('editing');
        confirm.remove();
        renderEvents(dateKey, events);
      };

      confirm.addEventListener('click', (evt) => {
        evt.stopPropagation();
        commit();
      });

      input.addEventListener('blur', commit);
      timeInput.addEventListener('blur', commit);
      input.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter') commit();
        if (evt.key === 'Escape') renderEvents(dateKey, events);
      });
    });

    const remove = document.createElement('button');
    remove.className = 'task-action remove';
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Remove event');
    remove.innerHTML = '<i class="fa-solid fa-x" aria-hidden="true"></i>';
    remove.addEventListener('click', () => {
      events.splice(index, 1);
      setEvents(dateKey, events);
      renderEvents(dateKey, events);
      updateDayCard(dateKey);
      renderCalendar();
    });

    actions.append(edit, remove);
    item.append(time, text, actions);

    item.addEventListener('click', (evt) => {
      const target = evt.target;
      if (target.closest('button') || target.closest('input') || target.closest('select')) {
        return;
      }
      item.classList.toggle('show-actions');
    });

    eventList.appendChild(item);
  });
}

function selectDate(date) {
  selectedDate = new Date(date.getTime());
  renderCalendar();
  renderTasks();
  if (dayPanel && typeof dayPanel.openSheet === 'function') {
    dayPanel.openSheet();
  }
}

function addTask() {
  if (!selectedDate) return;
  const text = taskText.value.trim();
  if (!text) return;

  const dateKey = formatDateKey(selectedDate);
  const tasks = getTasks(dateKey);
  const tagValue = normalizeTag(taskTag.value);
  tasks.push({ text, done: false, tag: tagValue });
  setTasks(dateKey, tasks);
  taskText.value = '';
  taskTag.value = DEFAULT_TAG;

  if (!tags.includes(tagValue)) {
    tags.push(tagValue);
    tags = ensureDefaultTag(tags);
    tags.sort((a, b) => (a === DEFAULT_TAG ? 1 : b === DEFAULT_TAG ? -1 : a.localeCompare(b)));
    saveTags();
    renderTagOptions();
    renderTagManager();
    renderTagViewTabs();
  }

  renderTasks();
  updateDayCard(dateKey);
  renderTagView();

  const lastTask = taskList.querySelector('.task-group:last-child .task-item:last-child');
  if (lastTask) {
    lastTask.classList.add('enter');
    requestAnimationFrame(() => {
      lastTask.classList.add('enter-active');
      lastTask.classList.remove('enter');
    });
  }
}

function addEvent() {
  if (!selectedDate) return;
  const text = eventText.value.trim();
  if (!text) return;

  const dateKey = formatDateKey(selectedDate);
  const events = getEvents(dateKey);
  events.push({ text, time: eventTime.value || '' });
  setEvents(dateKey, events);
  eventText.value = '';
  eventTime.value = '';
  renderEvents(dateKey, events);
  updateDayCard(dateKey);
  renderCalendar();
}

addTaskBtn.addEventListener('click', addTask);
addEventBtn.addEventListener('click', addEvent);

taskText.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') addTask();
});

eventText.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') addEvent();
});

eventTime.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') addEvent();
});

addTagBtn.addEventListener('click', addTag);

newTagInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') addTag();
});

prevMonthBtn.addEventListener('click', () => {
  const nextDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
  animateCalendar('prev', nextDate);
});

nextMonthBtn.addEventListener('click', () => {
  const nextDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
  animateCalendar('next', nextDate);
});

selectDate(new Date());
calendarB.classList.add('hidden');
function setupTagManagerOverlay() {
  if (!tagManagerToggle || !tagManagerOverlay) return;

  tagManagerToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = tagManagerOverlay.classList.toggle('open');
    tagManagerOverlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  });

  document.addEventListener('click', (event) => {
    if (!tagManagerOverlay.classList.contains('open')) return;
    if (tagManagerOverlay.contains(event.target) || tagManagerToggle.contains(event.target)) return;
    tagManagerOverlay.classList.remove('open');
    tagManagerOverlay.setAttribute('aria-hidden', 'true');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!tagManagerOverlay.classList.contains('open')) return;
    tagManagerOverlay.classList.remove('open');
    tagManagerOverlay.setAttribute('aria-hidden', 'true');
  });
}
