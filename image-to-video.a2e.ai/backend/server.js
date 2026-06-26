const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { AgnesBridge } = require('./agnes-bridge');
const { MuapiBridge } = require('./muapi-bridge');
const { ComfyUIBridge } = require('./comfyui-bridge');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/results', express.static(path.join(__dirname, 'results')));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Ensure directories exist
['uploads', 'results'].forEach(dir => {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// File upload config - single image
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext || mime) return cb(null, true);
    cb(new Error('Only jpg/png/webp images allowed'));
  }
});

// Initialize bridges (enabled if API key is set)
const agnesBridge = process.env.AGNES_API_KEY
  ? new AgnesBridge(process.env.AGNES_API_KEY)
  : null;

const muapiBridge = process.env.MUAPI_API_KEY
  ? new MuapiBridge(process.env.MUAPI_API_KEY)
  : null;

const comfyuiBridge = new ComfyUIBridge(
  process.env.COMFYUI_HOST || '127.0.0.1',
  process.env.COMFYUI_PORT || 8188
);

// In-memory job store
const jobs = new Map();

/**
 * Provider chain configuration
 */
const PROVIDERS = [
  { name: 'agnes', bridge: agnesBridge, label: 'Agnes AI (Ücretsiz)' },
  { name: 'muapi', bridge: muapiBridge, label: 'HappyHorse 1.0' },
  { name: 'comfyui', bridge: comfyuiBridge, label: 'CogVideoX (Yerel GPU)' }
];

/**
 * Try each provider in order until one succeeds
 */
function tryProviders(jobId, imagePath, prompt) {
  return new Promise((resolve, reject) => {
    let attemptIndex = 0;

    function tryNext() {
      // Find next enabled provider
      while (attemptIndex < PROVIDERS.length) {
        const p = PROVIDERS[attemptIndex];
        attemptIndex++;
        if (p.bridge) {
          return attemptProvider(p);
        }
      }
      // All providers exhausted
      reject(new Error('Tüm sağlayıcılar denendi ama hiçbiri video üretemedi.'));
    }

    function attemptProvider(provider) {
      const job = jobs.get(jobId);
      if (!job) return;

      job.provider = provider.name;
      job.providerLabel = provider.label;
      job.status = 'processing';
      job.progress = 0;

      console.log(`[Server] Trying provider: ${provider.label}`);

      provider.bridge.generate(imagePath, prompt, {
        onProgress: (progress) => {
          const j = jobs.get(jobId);
          if (j) j.progress = progress;
        },
        onComplete: (resultUrl) => {
          const j = jobs.get(jobId);
          if (j) {
            j.status = 'completed';
            j.progress = 100;
            j.resultUrl = resultUrl;
            console.log(`[Server] ✅ ${provider.label} succeeded`);
            resolve(resultUrl);
          }
        },
        onError: (error) => {
          console.warn(`[Server] ❌ ${provider.label} failed:`, error.message);
          const j = jobs.get(jobId);
          if (j) {
            j.errors = j.errors || [];
            j.errors.push(`${provider.label}: ${error.message}`);
          }
          tryNext(); // Try next provider
        }
      });
    }

    tryNext();
  });
}

// ========================
// API ROUTES
// ========================

/**
 * POST /api/generate
 * Upload an image and generate a video
 * Body: image (file) + prompt (text)
 */
app.post('/api/generate', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Lütfen bir resim yükleyin.' });
    }

    const prompt = req.body.prompt || 'Hafif hareket, doğal akış, sinematik kamera hareketi';
    const imagePath = req.file.path;
    const jobId = uuidv4();

    const job = {
      id: jobId,
      status: 'queued',
      progress: 0,
      provider: null,
      providerLabel: null,
      createdAt: new Date().toISOString(),
      resultUrl: null,
      error: null,
      errors: []
    };
    jobs.set(jobId, job);

    // Respond immediately with jobId
    res.json({ jobId, status: 'queued' });

    // Process asynchronously with provider chain
    tryProviders(jobId, imagePath, prompt)
      .then((videoUrl) => {
        // Already handled in onComplete
      })
      .catch((error) => {
        const j = jobs.get(jobId);
        if (j) {
          j.status = 'failed';
          j.error = error.message || 'Tüm sağlayıcılar başarısız oldu';
        }
      });

  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/status/:jobId
 * Returns job status and result URL when done
 */
app.get('/api/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    provider: job.provider,
    providerLabel: job.providerLabel,
    resultUrl: job.resultUrl,
    error: job.error,
    createdAt: job.createdAt
  });
});

/**
 * GET /api/providers
 * Returns available providers and their status
 */
app.get('/api/providers', (req, res) => {
  res.json({
    providers: PROVIDERS.map(p => ({
      name: p.name,
      label: p.label,
      enabled: !!p.bridge,
      available: p.bridge !== null
    }))
  });
});

/**
 * GET /api/samples
 * Returns sample images for the UI
 */
app.get('/api/samples', (req, res) => {
  res.json({
    images: [
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/m1.jpg', name: 'Portre 1' },
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/m2.jpg', name: 'Portre 2' },
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/m3.jpg', name: 'Portre 3' },
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/t-shirt.png', name: 'Ürün 1' },
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/dress.png', name: 'Ürün 2' }
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🎬 Image to Video API running on http://localhost:${PORT}`);
  console.log('');
  console.log('📡 Provider Chain:');
  PROVIDERS.forEach(p => {
    const status = p.bridge ? '✅ HAZIR' : '⚠️  API KEY GEREKLİ';
    console.log(`   ${p.label}: ${status}`);
  });
  console.log('');
  console.log(`🔗 ComfyUI target: ${comfyuiBridge.host}:${comfyuiBridge.port}`);
});
