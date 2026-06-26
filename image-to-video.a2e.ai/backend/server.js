require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { HFProvider } = require('./providers/hf-provider');

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

// Upload config - single image
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mime);
    if (ext || mime) return cb(null, true);
    cb(new Error('Only jpg/png/webp images allowed'));
  }
});

// HF Provider instance
let hfProvider = null;

function initHFProvider(token) {
  if (token) {
    hfProvider = new HFProvider(token);
    console.log('[Server] HF Provider ready');
    return true;
  }
  hfProvider = null;
  console.log('[Server] HF Token not set');
  return false;
}

initHFProvider(process.env.HF_TOKEN);

// In-memory job store
const jobs = new Map();

// ========================
// API ROUTES
// ========================

// POST /api/generate — single image upload, returns video
app.post('/api/generate', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Lutfen bir gorsel yukleyin.' });
    }

    const imagePath = req.file.path;
    const prompt = req.body.prompt || '';
    const jobId = uuidv4();

    const job = {
      id: jobId,
      status: 'queued',
      progress: 0,
      prompt,
      createdAt: new Date().toISOString(),
      resultUrl: null,
      error: null
    };
    jobs.set(jobId, job);

    // Respond immediately with jobId
    res.json({ jobId, status: 'queued' });

    if (!hfProvider) {
      const j = jobs.get(jobId);
      if (j) {
        j.status = 'failed';
        j.error = 'HF Token ayarlanmamis. Ayarlar menusunden HF Token girin.';
      }
      return;
    }

    await hfProvider.generate(jobId, imagePath, {
      onProgress: (progress) => {
        const j = jobs.get(jobId);
        if (j) j.progress = progress;
      },
      onComplete: (resultPath) => {
        const j = jobs.get(jobId);
        if (j) {
          j.status = 'completed';
          j.progress = 100;
          j.resultUrl = '/results/' + path.basename(resultPath);
          console.log('[Server] Job ' + jobId + ' completed');
        }
      },
      onError: (error) => {
        const j = jobs.get(jobId);
        if (j) {
          j.status = 'failed';
          j.error = error.message || 'Video olusturma basarisiz oldu';
        }
      }
    });

  } catch (error) {
    console.error('Generate error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// POST /api/set-key
app.post('/api/set-key', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: 'HF Token gerekli' });
  }
  const enabled = initHFProvider(apiKey);
  res.json({ success: true, enabled });
});

// GET /api/status/:jobId
app.get('/api/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    prompt: job.prompt,
    resultUrl: job.resultUrl,
    error: job.error,
    createdAt: job.createdAt
  });
});

// GET /api/status
app.get('/api/status', (req, res) => {
  res.json({
    hfEnabled: !!hfProvider,
    model: 'stabilityai/stable-video-diffusion-img2vid',
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log('');
  console.log('Image to Video API');
  console.log('Port: ' + PORT);
  console.log('Model: stabilityai/stable-video-diffusion-img2vid');
  console.log('HF: ' + (hfProvider ? 'Token set' : 'Token not set'));
  console.log('');
});
