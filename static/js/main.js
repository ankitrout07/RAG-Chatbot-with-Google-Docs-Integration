/* ======================================================
   WayneTech RAG Chatbot — main.js (FULL, feature-complete)
   - Background particles
   - Hero typing
   - Scroll progress & reveal
   - Theme toggle hook
   - Chat overlay + upload console (drag/drop)
   - XHR upload with progress + fallback
   - Chat -> POST /ask
   - Voice recognition
   - Save / copy / clear chat utilities (if buttons exist)
   ====================================================== */

'use strict';

/* -------------------------
   Cached DOM references
   ------------------------- */
const canvas = document.getElementById('bgCanvas');
const typingText = document.getElementById('typing-text');
const scrollProgress = document.getElementById('scroll-progress');

// navbar / layout controls
const menuToggleBtn = document.getElementById('menu-toggle');

// system sidebar (Retrieval & ML + System health)
const systemSidebar = document.getElementById('system-sidebar');
const systemSidebarBackdrop = document.getElementById('system-sidebar-backdrop');
const systemSidebarCloseBtn = document.getElementById('system-sidebar-close');

const chatOverlay = document.getElementById('chat-overlay');
const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const regenBtn = document.getElementById('regen-btn');
const citationsToggle = document.getElementById('citations-toggle');
const citationsPanel = document.getElementById('citations-panel');
const modeToggle = document.getElementById('mode-toggle');
const modeLabelText = document.getElementById('mode-label-text');

const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('file-list');
const uploadProgressWrap = document.getElementById('upload-progress');
const progressBar = document.getElementById('progress-bar');
const uploadStatus = document.getElementById('upload-status');
const uploadClearBtn = document.getElementById('upload-clear');

const micBtn = document.getElementById('mic-btn');
const retrievedEl = document.getElementById('retrieved');

// Google Docs picker modal elements
const docsModal = document.getElementById('docs-modal');
const docsListEl = document.getElementById('docs-list');
const docsModalLoadBtn = document.getElementById('docs-modal-load');
const docsModalCancelBtn = document.getElementById('docs-modal-cancel');
const docsModalCloseBtn = document.getElementById('docs-modal-close');
const docsModalStatus = document.getElementById('docs-modal-status');

// System health UI elements
const healthStatusEl = document.getElementById('health-status');
const healthRefreshBtn = document.getElementById('health-refresh');

const yearEl = document.getElementById('year');

// simple busy flag so we don't spam the backend
let isChatBusy = false;

// local chat history sessions (sidebar)
const SESSIONS_KEY = 'rag_chat_sessions_v1';
let sessions = [];
let currentSessionId = null;

/* Defensive / no-op fallbacks */
function elSafe(id){ return document.getElementById(id) || null; }

/* ---------------
   BACKGROUND PARTICLES
   --------------- */
(function particlesBackground() {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let DPR = Math.max(1, window.devicePixelRatio || 1);
  let particles = [];
  const COUNT = 80;

  function resize() {
    DPR = Math.max(1, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.floor(w * DPR);
    canvas.height = Math.floor(h * DPR);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    initParticles();
  }

  function rand(min, max){ return Math.random()*(max-min)+min; }

  function initParticles(){
    particles = [];
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    for (let i=0;i<COUNT;i++){
      particles.push({
        x: rand(0, w),
        y: rand(0, h),
        r: rand(0.6, 3.2),
        vx: rand(-0.25, 0.25),
        vy: rand(-0.12, 0.12),
        hue: rand(150, 210),
        alpha: rand(0.08, 0.22)
      });
    }
  }

  function draw(){
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    // subtle dark fill (creates motion trail effect)
    ctx.fillStyle = 'rgba(13,17,23,0.28)';
    ctx.fillRect(0,0,w,h);

    for (const p of particles){
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -20) p.x = w + 20;
      if (p.x > w + 20) p.x = -20;
      if (p.y < -20) p.y = h + 20;
      if (p.y > h + 20) p.y = -20;

      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r*8);
      grd.addColorStop(0, `hsla(${p.hue},95%,55%,${p.alpha})`);
      grd.addColorStop(1, `hsla(${p.hue},95%,55%,0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r*6, 0, Math.PI*2);
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  draw();
})();

/* ---------------
   HERO TYPING
   --------------- */
(function heroTyping(){
  if (!typingText) return;
  const lines = [
    'Retrieving knowledge from your documents...',
    'Generating grounded, factual responses...',
    'WayneTech AI — Your knowledge, served precisely.'
  ];
  let li = 0, ci = 0, forward = true;

  function step(){
    const line = lines[li];
    typingText.textContent = line.slice(0, ci);
    if (forward){
      ci++;
      if (ci > line.length){
        forward = false;
        setTimeout(step, 1200);
        return;
      }
    } else {
      ci--;
      if (ci < 0){
        forward = true;
        li = (li + 1) % lines.length;
      }
    }
    setTimeout(step, forward ? 36 : 22);
  }
  step();
})();

/* ---------------
   SCROLL PROGRESS & REVEAL
   --------------- */
(function scrollHelpers(){
  if (scrollProgress){
    window.addEventListener('scroll', ()=>{
      const d = document.documentElement;
      const pct = (d.scrollTop / (d.scrollHeight - d.clientHeight)) * 100 || 0;
      scrollProgress.style.width = pct + '%';
    }, {passive:true});
  }

  const observer = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if (e.isIntersecting) e.target.classList.add('visible');
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('[data-fade]').forEach(el => observer.observe(el));
})();

/* ---------------
   THEME TOGGLE (hook)
   --------------- */
(function themeHook(){
  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return;
  const THEME_KEY = 'waynetech_theme';
  function applyTheme(t){
    if (t === 'dark') document.body.classList.remove('light');
    else document.body.classList.add('light');
    localStorage.setItem(THEME_KEY, t);
  }
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(saved);
  themeToggle.addEventListener('click', ()=>{
    const next = (localStorage.getItem(THEME_KEY) === 'dark') ? 'light' : 'dark';
    applyTheme(next);
  });
})();

/* ---------------
   CHAT OPEN / CLOSE
   --------------- */
function openChat(){
  if (!chatOverlay) return;
  chatOverlay.classList.remove('hidden');
  chatOverlay.classList.add('visible');
  // reset upload status visually if present
  if (uploadStatus) uploadStatus.textContent = '';
  // seed chat box with welcome message only if empty
  if (chatBox && chatBox.children.length === 0){
    appendBotMessage('🧠 RAG Assistant online. Upload docs to begin (or ask a question).');
  }
  // focus input
  setTimeout(()=> userInput?.focus(), 300);
}
function closeChat(){
  if (!chatOverlay) return;
  chatOverlay.classList.remove('visible');
  setTimeout(()=> chatOverlay.classList.add('hidden'), 350);
}
window.openChat = openChat;
window.closeChat = closeChat;

/* ---------------
   UPLOAD AREA (drag/drop + XHR progress + preview)
   --------------- */
(function uploadConsole(){
  if (!uploadArea || !fileInput) return;

  // local state
  let lastFiles = null;
  let currentXHR = null;

  // helpers
  function humanSize(bytes){
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
    return (bytes/(1024*1024)).toFixed(2) + ' MB';
  }
  function clearFileList(){
    if (fileList) fileList.innerHTML = '';
    lastFiles = null;
  }

  // click to open file dialog
  uploadArea.addEventListener('click', ()=> fileInput.click());

  // drag effects
  uploadArea.addEventListener('dragover', (e)=>{
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  uploadArea.addEventListener('dragleave', ()=>{
    uploadArea.classList.remove('dragover');
  });
  uploadArea.addEventListener('drop', (e)=>{
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length) handleFiles(dt.files);
  });

  // file input change
  fileInput.addEventListener('change', ()=> {
    if (fileInput.files && fileInput.files.length) handleFiles(fileInput.files);
  });

  // Clear uploads button (optional in HTML)
  uploadClearBtn?.addEventListener('click', ()=> {
    // abort any in-flight xhr
    if (currentXHR) { currentXHR.abort(); currentXHR = null; }
    clearFileList();
    if (uploadStatus) uploadStatus.textContent = '';
    if (uploadProgressWrap) uploadProgressWrap.classList.add('hidden');
  });

  // Display files
  function renderFileList(files){
    lastFiles = files;
    if (!fileList) return;
    fileList.innerHTML = '';
    [...files].forEach(file => {
      const li = document.createElement('li');
      li.className = 'upload-file-item';
      const name = document.createElement('span');
      name.textContent = file.name;
      const size = document.createElement('small');
      size.textContent = humanSize(file.size);
      size.style.opacity = 0.8;
      li.appendChild(name);
      li.appendChild(size);
      fileList.appendChild(li);
    });
  }

  // show preview (for txt)
  async function tryPreview(files){
    const first = files[0];
    if (!first) return;
    const ext = (first.name.split('.').pop() || '').toLowerCase();
    if (ext === 'txt'){
      try{
        const text = await first.text();
        const preview = document.createElement('div');
        preview.className = 'file-preview';
        preview.textContent = text.slice(0, 1000) + (text.length > 1000 ? '\n\n... (truncated)' : '');
        if (uploadArea && preview) {
          // show as small node below list
          if (uploadStatus) uploadStatus.insertAdjacentElement('afterend', preview);
          else uploadArea.appendChild(preview);
        }
      }catch(e){ /* ignore preview errors */ }
    }
  }

  // handle files and upload
  async function handleFiles(files){
    renderFileList(files);
    tryPreview(files);
    if (uploadStatus) uploadStatus.textContent = '⏳ Preparing to upload...';
    if (uploadProgressWrap) uploadProgressWrap.classList.remove('hidden');
    if (progressBar) progressBar.style.width = '0%';

    // Build FormData
    const fd = new FormData();
    for (const f of files) fd.append('files', f);

    // Use XHR to get upload progress events
    const xhr = new XMLHttpRequest();
    currentXHR = xhr;
    xhr.open('POST', '/load_docs', true);

    // progress event
    xhr.upload.onprogress = function(evt){
      if (!evt.lengthComputable) return;
      const pct = Math.round((evt.loaded / evt.total) * 100);
      if (progressBar) progressBar.style.width = pct + '%';
      if (uploadStatus) uploadStatus.textContent = `Uploading... ${pct}%`;
    };

    // onload
    xhr.onload = function(){
      currentXHR = null;
      if (xhr.status >= 200 && xhr.status < 300){
        try{
          const data = JSON.parse(xhr.responseText);
          if (uploadStatus) uploadStatus.textContent = `✅ ${data.message || 'Upload complete.'}`;
          if (progressBar) progressBar.style.width = '100%';
          // optional: display retrieved snippet placeholders
          if (retrievedEl) retrievedEl.textContent = '(Documents loaded. Ready for queries.)';
        } catch(err){
          if (uploadStatus) uploadStatus.textContent = '✅ Upload complete (no JSON response)';
        }
      } else {
        if (uploadStatus) uploadStatus.textContent = `❌ Upload failed (${xhr.status})`;
      }
      // hide progress after short delay
      setTimeout(()=> uploadProgressWrap?.classList.add('hidden'), 1200);
    };

    // onerror
    xhr.onerror = function(){
      currentXHR = null;
      if (uploadStatus) uploadStatus.textContent = '❌ Upload error. Check network / backend.';
      uploadProgressWrap?.classList.add('hidden');
    };

    // timeout fallback: if progress events not firing, simulate progress until done
    let fakeInterval = null;
    const useFakeProgress = false; // we use real XHR unless environment blocks it
    if (useFakeProgress){
      let fake = 0;
      fakeInterval = setInterval(()=>{
        fake = Math.min(90, fake + Math.random()*12);
        if (progressBar) progressBar.style.width = fake + '%';
      }, 200);
    }

    try{
      xhr.send(fd);
    } catch (err){
      currentXHR = null;
      if (fakeInterval) clearInterval(fakeInterval);
      if (uploadStatus) uploadStatus.textContent = '❌ Upload failed (exception).';
      console.error('Upload send error', err);
    }
  } // handleFiles end

})();

/* ---------------
   CHAT: send -> /ask_stream or /ask (citations mode)
   --------------- */
const _decoder = new TextDecoder();
let lastUserQuestion = null;
let lastAnswerSources = [];
let currentMode = 'rag'; // 'rag' or 'chatgpt'

// initialize mode toggle label
if (modeToggle) {
  const updateModeLabel = () => {
    const isChatGPT = modeToggle.checked;
    currentMode = isChatGPT ? 'chatgpt' : 'rag';
    if (modeLabelText) {
      modeLabelText.textContent = isChatGPT ? 'ChatGPT' : 'Gemini';
    }
  };
  modeToggle.addEventListener('change', updateModeLabel);
  updateModeLabel();
}

async function sendMessage(){
  if (!userInput || !chatBox) return;
  if (isChatBusy) return; // avoid multiple parallel sends
  const text = userInput.value?.trim();
  if (!text) return;
  userInput.value = '';
  await runQuery(text, { showUserMessage: true });
}

async function runQuery(text, { showUserMessage } = { showUserMessage: true }){
  if (!chatBox) return;
  if (isChatBusy) return;
  isChatBusy = true;
  if (sendBtn) sendBtn.disabled = true;
  if (regenBtn) regenBtn.disabled = true;

  if (showUserMessage) {
    appendUserMessage(text);
    addMessageToCurrentSession({ role: 'user', content: text });
  }
  const typingId = appendBotTyping();
  lastUserQuestion = text;
  lastAnswerSources = [];
  if (citationsPanel) citationsPanel.innerHTML = '';

  const useCitations = !!(citationsToggle && citationsToggle.checked);
  const mode = currentMode;

  try {
    if (useCitations){
      // Non-streaming JSON with sources
      const res = await fetch('/ask', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ query: text, mode })
      });
      removeElementById(typingId);
      if (!res.ok){
        appendBotMessage(`❌ Server error: ${res.status}`);
        return;
      }
      const json = await res.json();
      const answer = (json && json.answer) ? json.answer : '(No answer returned)';
      const sources = Array.isArray(json.sources) ? json.sources : [];
      lastAnswerSources = sources;
      appendBotMessage(answer);
      addMessageToCurrentSession({ role: 'assistant', content: answer });
      renderCitations(sources);
    } else {
      // Streaming plain text
      const res = await fetch('/ask_stream', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ query: text, mode })
      });
      if (!res.ok || !res.body){
        removeElementById(typingId);
        appendBotMessage(`❌ Server error: ${res.status}`);
        return;
      }

      // Replace "Thinking..." with a live-updating bot message
      removeElementById(typingId);
      const botEl = appendBotMessage('');

      const reader = res.body.getReader();
      while (true){
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        const chunk = _decoder.decode(value, { stream: true });
        botEl.textContent += chunk;
        chatBox.scrollTop = chatBox.scrollHeight;
      }
      addMessageToCurrentSession({ role: 'assistant', content: botEl.textContent || '' });
    }

  } catch (err){
    removeElementById(typingId);
    appendBotMessage('❌ Could not reach backend. Check your internet or restart the server.');
    console.error('Chat send error', err);
  } finally {
    isChatBusy = false;
    if (sendBtn) sendBtn.disabled = false;
    if (regenBtn) regenBtn.disabled = !lastUserQuestion;
  }
}

if (regenBtn){
  regenBtn.addEventListener('click', async ()=>{
    if (!lastUserQuestion || isChatBusy) return;
    await runQuery(lastUserQuestion, { showUserMessage: false });
  });
}

window.sendMessage = sendMessage;

/* message helper functions with avatars */
function appendUserMessage(text){
  if (!chatBox) return;
  const row = document.createElement('div');
  row.className = 'chat-row user';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble user';
  bubble.textContent = text;

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar user';
  avatar.textContent = 'You';

  row.appendChild(bubble);
  row.appendChild(avatar);
  chatBox.appendChild(row);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function appendBotMessage(text){
  if (!chatBox) return;
  const row = document.createElement('div');
  row.className = 'chat-row bot';

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar bot';
  avatar.textContent = 'AI';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble bot';
  bubble.textContent = text;

  row.appendChild(avatar);
  row.appendChild(bubble);
  chatBox.appendChild(row);
  chatBox.scrollTop = chatBox.scrollHeight;
  return bubble;
}

function appendBotTyping(){
  if (!chatBox) return null;
  const row = document.createElement('div');
  row.className = 'chat-row bot bot-typing';

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar bot typing-avatar';
  avatar.textContent = 'AI';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble bot typing';
  bubble.id = 'bot-typing-' + Date.now();

  // Rich loading state: skeleton lines + wave + animated dots (via CSS ::after)
  bubble.innerHTML = `
    <div class="typing-label">AI is thinking</div>
    <div class="typing-skeleton">
      <div class="typing-skeleton-line"></div>
      <div class="typing-skeleton-line"></div>
      <div class="typing-skeleton-line short"></div>
    </div>
    <div class="typing-wave">
      <span></span><span></span><span></span><span></span>
    </div>
  `;

  row.appendChild(avatar);
  row.appendChild(bubble);
  chatBox.appendChild(row);
  chatBox.scrollTop = chatBox.scrollHeight;
  return bubble.id;
}

function removeElementById(id){
  if (!chatBox || !id) return;
  const el = document.getElementById(id);
  if (el) el.remove();
}

function renderCitations(sources){
  if (!citationsPanel) return;
  if (!sources || !sources.length){
    citationsPanel.textContent = '';
    return;
  }
  citationsPanel.innerHTML = '';
  const title = document.createElement('div');
  title.textContent = 'Sources:';
  citationsPanel.appendChild(title);

  const seen = new Set();
  for (const meta of sources){
    const label = meta?.source || JSON.stringify(meta);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const pill = document.createElement('span');
    pill.className = 'citation-pill';
    pill.textContent = label;
    citationsPanel.appendChild(pill);
  }
}

/* ---------------
   ENTER KEY BIND
   --------------- */
function handleKey(e){
  if (!e) return;
  if (e.key === 'Enter') {
    // if file input is focused do nothing; else send
    sendMessage();
  }
}
window.handleKey = handleKey;

/* ---------------
   VOICE INPUT
   --------------- */
(function voiceSetup(){
  if (!micBtn || !('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    if (micBtn) micBtn.style.opacity = 0.45;
    return;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener('result', (e) => {
    const transcript = e.results?.[0]?.[0]?.transcript;
    if (transcript && userInput) {
      userInput.value = transcript;
      sendMessage();
    }
  });
  recognition.addEventListener('error', (e) => {
    console.warn('Speech error', e);
    alert('Voice input error: ' + (e.error || 'unknown'));
  });

  micBtn.addEventListener('click', ()=>{
    try {
      recognition.start();
    } catch (err) {
      console.warn('recognition start error', err);
    }
  });
})();

/* ---------------
   CHAT UTILITIES: save / copy / clear if buttons exist
   --------------- */
(function chatUtilities(){
  // Save chat (if #saveChat exists as a button)
  const saveBtn = document.getElementById('saveChat');
  if (saveBtn){
    saveBtn.addEventListener('click', ()=>{
      const lines = [];
      chatBox?.querySelectorAll('.user-message, .bot-message').forEach(m=>{
        lines.push(m.textContent || '');
      });
      const blob = new Blob([lines.join('\n\n')], {type: 'text/plain'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `rag-chat-${Date.now()}.txt`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
    });
  }

  const copyBtn = document.getElementById('copyChat');
  if (copyBtn){
    copyBtn.addEventListener('click', async ()=>{
      try {
        let text = '';
        chatBox?.querySelectorAll('.user-message, .bot-message').forEach(m=>{
          text += (m.textContent || '') + '\n\n';
        });
        await navigator.clipboard.writeText(text);
        alert('Chat copied to clipboard');
      } catch (err) {
        alert('Copy failed: ' + (err.message || err));
      }
    });
  }

  const clearBtn = document.getElementById('clearChat');
  if (clearBtn){
    clearBtn.addEventListener('click', async ()=>{
      if (!confirm('Clear the current chat?')) return;

      // Clear UI
      if (chatBox) chatBox.innerHTML = '';
      if (retrievedEl) retrievedEl.textContent = '';
      if (citationsPanel) citationsPanel.innerHTML = '';

      // Reset client-side state
      lastUserQuestion = null;
      lastAnswerSources = [];
      if (regenBtn) regenBtn.disabled = true;

      // Tell backend to clear session memory
      try {
        await fetch('/clear_chat', { method: 'POST' });
      } catch (err) {
        console.warn('Failed to clear backend chat history', err);
      }
    });
  }
})();

/* ---------------
   LOGIN (Google Docs fetch) helper + Docs picker modal
   --------------- */
function openDocsModal(){
  if (!docsModal) return;
  docsModal.classList.remove('hidden');
  if (docsModalStatus) docsModalStatus.textContent = 'Loading your Google Docs…';
  if (docsListEl) docsListEl.innerHTML = '';
}

function closeDocsModal(){
  if (!docsModal) return;
  docsModal.classList.add('hidden');
}

function renderDocsList(docs){
  if (!docsListEl) return;
  docsListEl.innerHTML = '';
  if (!Array.isArray(docs) || !docs.length){
    const empty = document.createElement('div');
    empty.className = 'docs-modal-status';
    empty.textContent = 'No Google Docs found for this account.';
    docsListEl.appendChild(empty);
    return;
  }
  docs.forEach(doc => {
    const id = doc.id || doc.doc_id || doc.documentId;
    const name = doc.name || doc.title || '(Untitled)';
    if (!id) return;
    const row = document.createElement('div');
    row.className = 'docs-list-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.docId = id;
    const label = document.createElement('label');
    const nameEl = document.createElement('div');
    nameEl.className = 'docs-doc-name';
    nameEl.textContent = name;
    const idEl = document.createElement('div');
    idEl.className = 'docs-doc-id';
    idEl.textContent = id;
    label.appendChild(nameEl);
    label.appendChild(idEl);
    row.appendChild(checkbox);
    row.appendChild(label);
    docsListEl.appendChild(row);
  });
}

async function loginWithGoogle(){
  // Call backend /fetch_docs to trigger OAuth + list docs, but stay in SPA UI
  if (!docsModal) return;
  openDocsModal();
  try {
    const res = await fetch('/fetch_docs');
    if (!res.ok){
      if (docsModalStatus) docsModalStatus.textContent = `Failed to fetch Google Docs (status ${res.status}).`;
      return;
    }
    const docs = await res.json();
    if (docsModalStatus) docsModalStatus.textContent = 'Select the Google Docs you want to load:';
    renderDocsList(docs);
  } catch (err){
    console.error('Failed to fetch Google Docs', err);
    if (docsModalStatus) docsModalStatus.textContent = 'Error fetching Google Docs. Check your network and credentials.';
  }
}
window.loginWithGoogle = loginWithGoogle;

if (docsModalLoadBtn){
  docsModalLoadBtn.addEventListener('click', async ()=>{
    if (!docsListEl) return;
    const checkboxes = docsListEl.querySelectorAll('input[type="checkbox"][data-doc-id]');
    const ids = [];
    checkboxes.forEach(cb => {
      if (cb.checked && cb.dataset.docId) ids.push(cb.dataset.docId);
    });
    if (!ids.length){
      alert('Please select at least one Google Doc.');
      return;
    }
    if (docsModalStatus) docsModalStatus.textContent = 'Loading selected documents into knowledge base…';
    docsModalLoadBtn.disabled = true;
    try{
      const res = await fetch('/load_docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_ids: ids })
      });
      let json = null;
      try { json = await res.json(); } catch(e) { /* ignore */ }
      if (!res.ok){
        const msg = json && json.error ? json.error : `Failed to load docs (status ${res.status}).`;
        if (docsModalStatus) docsModalStatus.textContent = msg;
        docsModalLoadBtn.disabled = false;
        return;
      }
      const message = json && json.message ? json.message : 'Google Docs loaded successfully.';
      if (retrievedEl) retrievedEl.textContent = message;
      closeDocsModal();
    } catch (err){
      console.error('Failed to POST /load_docs', err);
      if (docsModalStatus) docsModalStatus.textContent = 'Error loading documents. Please try again.';
      docsModalLoadBtn.disabled = false;
    }
  });
}
if (docsModalCancelBtn){
  docsModalCancelBtn.addEventListener('click', closeDocsModal);
}
if (docsModalCloseBtn){
  docsModalCloseBtn.addEventListener('click', closeDocsModal);
}

/* ---------------
   CHAT HISTORY SIDEBAR (localStorage)
   --------------- */
function loadSessionsFromStorage(){
  try{
    const raw = localStorage.getItem(SESSIONS_KEY);
    sessions = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(sessions)) sessions = [];
  }catch(e){
    sessions = [];
  }
}

function saveSessionsToStorage(){
  try{
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  }catch(e){
    // ignore quota errors
  }
}

function getCurrentSession(){
  if (!currentSessionId && sessions.length){
    currentSessionId = sessions[0].id;
  }
  let session = sessions.find(s => s.id === currentSessionId);
  if (!session){
    session = createNewSession('New chat');
  }
  return session;
}

function createNewSession(name){
  const id = 's_' + Date.now();
  const now = new Date().toISOString();
  const session = { id, name: name || 'New chat', createdAt: now, updatedAt: now, messages: [] };
  sessions.unshift(session);
  currentSessionId = id;
  saveSessionsToStorage();
  renderSessionSidebar();
  return session;
}

function addMessageToCurrentSession(msg){
  if (!msg || !msg.content) return;
  const session = getCurrentSession();
  session.messages = session.messages || [];
  session.messages.push({ role: msg.role || 'assistant', content: msg.content });
  session.updatedAt = new Date().toISOString();
  if ((!session.name || session.name === 'New chat') && msg.role === 'user'){
    const base = msg.content.trim();
    if (base){
      session.name = base.length > 40 ? base.slice(0,40) + '…' : base;
    }
  }
  saveSessionsToStorage();
  renderSessionSidebar();
}

function renderSessionSidebar(){
  const listEl = document.getElementById('chat-session-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!sessions.length){
    const empty = document.createElement('div');
    empty.className = 'chat-session-item';
    empty.textContent = 'No chats yet';
    listEl.appendChild(empty);
    return;
  }
  sessions.forEach(session => {
    const item = document.createElement('div');
    item.className = 'chat-session-item' + (session.id === currentSessionId ? ' active' : '');

    const title = document.createElement('div');
    title.className = 'chat-session-title';
    title.textContent = session.name || 'Untitled chat';
    item.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'chat-session-meta';
    const count = (session.messages && session.messages.length) || 0;
    const countSpan = document.createElement('span');
    countSpan.textContent = count + ' msg';
    meta.appendChild(countSpan);
    item.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'chat-session-actions';
    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      renameSession(session.id);
    });
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      deleteSession(session.id);
    });
    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);
    item.appendChild(actions);

    item.addEventListener('click', ()=>{
      switchSession(session.id);
    });

    listEl.appendChild(item);
  });
}

function renderMessagesForSession(session){
  if (!chatBox) return;
  chatBox.innerHTML = '';
  if (!session || !Array.isArray(session.messages)) return;
  for (const msg of session.messages){
    const role = msg.role === 'user' ? 'user' : 'bot';
    const row = document.createElement('div');
    row.className = 'chat-row ' + role;

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + role;
    bubble.textContent = msg.content || '';

    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar ' + role;
    avatar.textContent = role === 'user' ? 'You' : 'AI';

    if (role === 'user'){
      row.appendChild(bubble);
      row.appendChild(avatar);
    } else {
      row.appendChild(avatar);
      row.appendChild(bubble);
    }
    chatBox.appendChild(row);
  }
  chatBox.scrollTop = chatBox.scrollHeight;
}

function switchSession(id){
  if (currentSessionId === id) return;
  const session = sessions.find(s => s.id === id);
  if (!session) return;
  currentSessionId = id;
  renderMessagesForSession(session);
  renderSessionSidebar();
}

function renameSession(id){
  const session = sessions.find(s => s.id === id);
  if (!session) return;
  const next = prompt('Rename chat', session.name || '');
  if (!next) return;
  const trimmed = next.trim();
  if (!trimmed) return;
  session.name = trimmed;
  saveSessionsToStorage();
  renderSessionSidebar();
}

function deleteSession(id){
  const session = sessions.find(s => s.id === id);
  if (!session) return;
  if (!confirm('Delete this chat?')) return;
  sessions = sessions.filter(s => s.id !== id);
  if (sessions.length === 0){
    currentSessionId = null;
    if (chatBox) chatBox.innerHTML = '';
  } else {
    currentSessionId = sessions[0].id;
    renderMessagesForSession(sessions[0]);
  }
  saveSessionsToStorage();
  renderSessionSidebar();
}

(function initChatHistorySidebar(){
  loadSessionsFromStorage();
  getCurrentSession();
  renderSessionSidebar();
  const newChatBtn = document.getElementById('new-chat-btn');
  if (newChatBtn){
    newChatBtn.addEventListener('click', ()=>{
      const session = createNewSession('New chat');
      if (chatBox) chatBox.innerHTML = '';
      if (citationsPanel) citationsPanel.innerHTML = '';
      renderMessagesForSession(session);
    });
  }
})();

/* ---------------
   SYSTEM SIDEBAR TOGGLE (three-line menu)
   --------------- */
function openSystemSidebar(){
  if (!systemSidebar) return;
  systemSidebar.classList.add('open');
}

function closeSystemSidebar(){
  if (!systemSidebar) return;
  systemSidebar.classList.remove('open');
}

if (menuToggleBtn && systemSidebar){
  menuToggleBtn.addEventListener('click', ()=>{
    const isOpen = systemSidebar.classList.contains('open');
    if (isOpen) closeSystemSidebar(); else openSystemSidebar();
  });
}
if (systemSidebarBackdrop){
  systemSidebarBackdrop.addEventListener('click', closeSystemSidebar);
}
if (systemSidebarCloseBtn){
  systemSidebarCloseBtn.addEventListener('click', closeSystemSidebar);
}

/* ---------------
   SYSTEM HEALTH UI (/health)
   --------------- */
function renderHealthStatus(data){
  if (!healthStatusEl) return;
  const rows = [];
  const okBackend = data && data.status === 'ok';
  rows.push({ label: 'Backend', ok: okBackend });
  rows.push({ label: 'Vector store loaded', ok: !!(data && data.vector_store_loaded) });
  rows.push({ label: 'Embeddings (Gemini key)', ok: !!(data && data.gemini_configured) });
  rows.push({ label: 'ChatGPT API key', ok: !!(data && data.openai_configured) });
  rows.push({ label: 'Google credentials.json', ok: !!(data && data.google_credentials_present) });

  healthStatusEl.innerHTML = '';
  rows.forEach(row => {
    const div = document.createElement('div');
    div.className = 'health-row';
    const label = document.createElement('span');
    label.className = 'health-label';
    label.textContent = row.label;
    const pill = document.createElement('span');
    pill.className = 'health-pill ' + (row.ok ? 'ok' : 'bad');
    pill.textContent = row.ok ? 'OK' : 'Check';
    div.appendChild(label);
    div.appendChild(pill);
    healthStatusEl.appendChild(div);
  });
}

async function fetchHealth(){
  if (!healthStatusEl) return;
  // show pending state
  healthStatusEl.innerHTML = '';
  const pendingRow = document.createElement('div');
  pendingRow.className = 'health-row';
  const lbl = document.createElement('span');
  lbl.className = 'health-label';
  lbl.textContent = 'Checking system health…';
  const pill = document.createElement('span');
  pill.className = 'health-pill pending';
  pill.textContent = '...';
  pendingRow.appendChild(lbl);
  pendingRow.appendChild(pill);
  healthStatusEl.appendChild(pendingRow);

  try{
    const res = await fetch('/health');
    if (!res.ok){
      renderHealthStatus(null);
      return;
    }
    const data = await res.json();
    renderHealthStatus(data);
  }catch(e){
    console.warn('Failed to fetch /health', e);
    renderHealthStatus(null);
  }
}

if (healthRefreshBtn){
  healthRefreshBtn.addEventListener('click', fetchHealth);
}
// initial health check on page load
fetchHealth();

/* ---------------
   FOOTER YEAR
   --------------- */
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* expose sendMessage so inline onclicks work */
window.sendMessage = sendMessage;

/* Good to go! */
console.log('WayneTech main.js loaded — UI features ready.');
