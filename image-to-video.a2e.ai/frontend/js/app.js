// === State ===
const state = {
  imageFile: null,
  imageDataUrl: null,
  jobId: null,
  polling: false
};

// === DOM Elements ===
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const imageDropZone = $('#imageDropZone');
const imageInput = $('#imageInput');
const imagePreview = $('#imagePreview');
const imagePlaceholder = $('#imagePlaceholder');
const imagePreviewImg = $('#imagePreviewImg');
const imageRemove = $('#imageRemove');
const imageSample = $('#imageSample');
const promptInput = $('#promptInput');
const promptCounter = $('#promptCounter');
const generateBtn = $('#generateBtn');
const providerStatus = $('#providerStatus');
const statusDot = $('#statusDot');
const providerCount = $('#providerCount');
const progressSection = $('#progressSection');
const progressFill = $('#progressFill');
const progressText = $('#progressText');
const progressProvider = $('#progressProvider');
const resultSection = $('#resultSection');
const resultOriginal = $('#resultOriginal');
const resultVideo = $('#resultVideo');
const resultProviderBadge = $('#resultProviderBadge');
const downloadBtn = $('#downloadBtn');
const tryAgainBtn = $('#tryAgainBtn');
const themeToggle = $('#themeToggle');
const themeIcon = $('#themeIcon');

// Chain status elements
const chainItems = {
  agnes: $('#chain-agnes'),
  muapi: $('#chain-muapi'),
  comfyui: $('#chain-comfyui')
};

// === API Base URL ===
const API_BASE = 'http://localhost:3001';

// === Theme ===
function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
}

const savedTheme = localStorage.getItem('theme') || 'dark';
setTheme(savedTheme);

themeToggle.addEventListener('click', () => {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
});

// === Initialize ===
async function init() {
  await checkProviders();
  await updatePromptCounter();
}

// === Provider Check ===
async function checkProviders() {
  try {
    const resp = await fetch(`${API_BASE}/api/providers`);
    const data = await resp.json();
    
    let activeCount = 0;
    data.providers.forEach(p => {
      const el = document.getElementById(`status-${p.name}`);
      const chainEl = chainItems[p.name];
      
      if (p.enabled) {
        activeCount++;
        if (el) {
          el.textContent = '✅ Hazır';
          el.className = 'provider-card-status ready';
        }
        if (chainEl) chainEl.classList.add('active');
      } else {
        if (el) {
          el.textContent = '⚠️ API Key gerekli';
          el.className = 'provider-card-status pending';
        }
        if (chainEl) chainEl.classList.remove('active');
      }
    });

    providerCount.textContent = `${activeCount}/3 aktif`;
    statusDot.className = `status-dot ${activeCount > 0 ? 'active' : ''}`;
  } catch (err) {
    providerCount.textContent = '⚠️ Bağlantı yok';
    statusDot.className = 'status-dot';
  }
}

// === Prompt Counter ===
async function updatePromptCounter() {
  const len = promptInput.value.length;
  promptCounter.textContent = `${len}/500`;
}

promptInput.addEventListener('input', () => {
  updatePromptCounter();
  if (promptInput.value.length > 500) {
    promptInput.value = promptInput.value.substring(0, 500);
    updatePromptCounter();
  }
  // Auto-resize
  promptInput.style.height = 'auto';
  promptInput.style.height = promptInput.scrollHeight + 'px';
});

// === Suggestion Chips ===
$$('.suggestion-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    promptInput.value = chip.dataset.prompt;
    updatePromptCounter();
    // Auto-resize
    promptInput.style.height = 'auto';
    promptInput.style.height = promptInput.scrollHeight + 'px';
  });
});

// === File Upload ===
function setupImageUpload() {
  const maxSize = 20 * 1024 * 1024;
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

  function handleFile(file) {
    if (!file) return;
    if (!allowedTypes.includes(file.type)) {
      alert('Desteklenmeyen dosya türü. İzin verilenler: jpg, png, webp');
      return;
    }
    if (file.size > maxSize) {
      alert('Dosya çok büyük. Maksimum 20MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreviewImg.src = e.target.result;
      imagePlaceholder.classList.add('hidden');
      imagePreview.classList.remove('hidden');
      
      state.imageDataUrl = e.target.result;
      state.imageFile = file;
      
      updateGenerateBtn();
    };
    reader.readAsDataURL(file);
  }

  imageDropZone.addEventListener('click', (e) => {
    if (e.target.closest('.remove-btn')) return;
    imageInput.click();
  });

  imageInput.addEventListener('change', () => {
    if (imageInput.files.length > 0) {
      handleFile(imageInput.files[0]);
    }
  });

  imageDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    imageDropZone.classList.add('drag-over');
  });

  imageDropZone.addEventListener('dragleave', () => {
    imageDropZone.classList.remove('drag-over');
  });

  imageDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    imageDropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  imageRemove.addEventListener('click', (e) => {
    e.stopPropagation();
    previewClear();
  });

  return handleFile;
}

function previewClear() {
  imagePreview.classList.add('hidden');
  imagePlaceholder.classList.remove('hidden');
  imagePreviewImg.src = '';
  imageInput.value = '';
  state.imageFile = null;
  state.imageDataUrl = null;
  updateGenerateBtn();
}

const handleImageUpload = setupImageUpload();

// === Sample Images ===
const SAMPLE_IMAGES = [
  'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/m1.jpg',
  'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/m2.jpg',
  'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/m3.jpg'
];
let sampleIndex = 0;

imageSample.addEventListener('click', async (e) => {
  e.stopPropagation();
  const url = SAMPLE_IMAGES[sampleIndex % SAMPLE_IMAGES.length];
  sampleIndex++;
  
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const ext = url.split('.').pop() || 'jpg';
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    const file = new File([blob], `sample.${ext}`, { type: mime });
    
    const dt = new DataTransfer();
    dt.items.add(file);
    imageInput.files = dt.files;
    
    handleImageUpload(file);
  } catch (err) {
    console.error('Örnek resim yüklenemedi:', err);
  }
});

// === Generate Button ===
function updateGenerateBtn() {
  generateBtn.disabled = !state.imageFile;
  if (state.imageFile) {
    generateBtn.classList.add('ready');
  } else {
    generateBtn.classList.remove('ready');
  }
}

// === Generate Handler ===
generateBtn.addEventListener('click', async () => {
  if (!state.imageFile) return;

  // Reset UI
  hideError();
  resultSection.classList.add('hidden');
  progressSection.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = 'Sıraya alındı...';
  progressProvider.textContent = 'Sağlayıcı seçiliyor...';
  generateBtn.disabled = true;
  generateBtn.querySelector('.btn-text').textContent = 'Oluşturuluyor...';

  // Reset chain highlights
  Object.values(chainItems).forEach(el => el.classList.remove('trying', 'failed', 'success'));

  const formData = new FormData();
  formData.append('image', state.imageFile);
  formData.append('prompt', promptInput.value.trim() || 'Hafif hareket, doğal akış, sinematik kamera hareketi');

  try {
    const resp = await fetch(`${API_BASE}/api/generate`, {
      method: 'POST',
      body: formData
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || 'Video oluşturma başarısız');
    }

    const { jobId } = await resp.json();
    state.jobId = jobId;

    await pollJob(jobId);

  } catch (err) {
    progressSection.classList.add('hidden');
    showError(err.message);
    resetGenerateBtn();
  }
});

async function pollJob(jobId) {
  const maxAttempts = 600; // 10 minutes
  state.polling = true;
  let failedProviders = [];

  for (let i = 0; i < maxAttempts && state.polling; i++) {
    try {
      const resp = await fetch(`${API_BASE}/api/status/${jobId}`);
      const job = await resp.json();

      progressFill.style.width = `${job.progress || 0}%`;

      // Update provider info
      if (job.provider) {
        progressProvider.textContent = `${job.providerLabel || job.provider} çalışıyor...`;
        
        // Highlight active provider in chain
        Object.keys(chainItems).forEach(key => {
          const el = chainItems[key];
          el.classList.remove('trying', 'failed', 'success');
          if (key === job.provider) {
            el.classList.add('trying');
          } else if (failedProviders.includes(key)) {
            el.classList.add('failed');
          }
        });
      }

      if (job.status === 'completed') {
        progressText.textContent = 'Tamamlandı!';
        // Mark provider as successful
        if (job.provider && chainItems[job.provider]) {
          chainItems[job.provider].classList.remove('trying');
          chainItems[job.provider].classList.add('success');
        }
        // Also mark failed providers
        if (job.errors) {
          job.errors.forEach(err => {
            const providerName = err.split(':')[0]?.trim().toLowerCase();
            if (providerName && chainItems[providerName]) {
              chainItems[providerName].classList.add('failed');
            }
          });
        }
        await showResult(job);
        state.polling = false;
        return;
      }

      if (job.status === 'failed') {
        throw new Error(job.error || 'Video oluşturma başarısız');
      }

      // Track failed providers from errors array
      if (job.errors && job.errors.length > failedProviders.length) {
        for (const err of job.errors) {
          const providerName = err.split(':')[0]?.trim().toLowerCase();
          if (providerName && !failedProviders.includes(providerName)) {
            failedProviders.push(providerName);
            if (chainItems[providerName]) {
              chainItems[providerName].classList.remove('trying');
              chainItems[providerName].classList.add('failed');
            }
          }
        }
      }

      progressText.textContent = `İşleniyor... %${job.progress || 0}`;
    } catch (err) {
      if (err.message.includes('başarısız')) throw err;
      // Transient errors: continue polling
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  if (state.polling) {
    throw new Error('Zaman aşımı. Lütfen tekrar deneyin.');
  }
}

async function showResult(job) {
  progressSection.classList.add('hidden');
  resultSection.classList.remove('hidden');
  
  // Show original image
  resultOriginal.src = state.imageDataUrl;
  
  // Show result video
  const videoUrl = job.resultUrl;
  if (videoUrl) {
    // If it's a full URL, use it directly; otherwise prefix with API_BASE
    if (videoUrl.startsWith('http')) {
      resultVideo.src = videoUrl;
    } else {
      resultVideo.src = `${API_BASE}${videoUrl}`;
    }
  }
  
  // Show provider badge
  resultProviderBadge.textContent = job.providerLabel || job.provider || 'AI';
  
  // Setup download
  downloadBtn.onclick = () => {
    const link = document.createElement('a');
    if (job.resultUrl.startsWith('http')) {
      link.href = job.resultUrl;
    } else {
      link.href = `${API_BASE}${job.resultUrl}`;
    }
    link.download = 'ai-video.mp4';
    link.click();
  };

  resetGenerateBtn();
}

// === Try Again ===
tryAgainBtn.addEventListener('click', () => {
  resultSection.classList.add('hidden');
  resultVideo.pause();
  resultVideo.src = '';
  previewClear();
  promptInput.value = '';
  updatePromptCounter();
  Object.values(chainItems).forEach(el => el.classList.remove('trying', 'failed', 'success'));
});

// === Error Handling ===
function showError(message) {
  const existing = document.querySelector('.error-message');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = 'error-message';
  el.textContent = '⚠️ ' + message;
  
  const generateSection = document.querySelector('.generate-section');
  generateSection.parentNode.insertBefore(el, generateSection.nextSibling);

  setTimeout(() => el.remove(), 10000);
}

function hideError() {
  const existing = document.querySelector('.error-message');
  if (existing) existing.remove();
}

function resetGenerateBtn() {
  generateBtn.disabled = false;
  generateBtn.querySelector('.btn-text').textContent = 'Video Oluştur';
}

// === Tabs ===
$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.remove('active'));
    $$('.tab-content').forEach(tc => tc.classList.remove('active'));
    
    tab.classList.add('active');
    const target = document.getElementById('tab' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1));
    if (target) target.classList.add('active');
  });
});

// === Keyboard Shortcut ===
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    generateBtn.click();
  }
});

// === Init ===
init();
console.log('🎬 Image to Video AI - Hazır!');
