const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { ComfyUIBridge } = require('./comfyui-bridge');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/results', express.static(path.join(__dirname, 'results')));

// Ensure directories exist
['uploads', 'results'].forEach(dir => {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// File upload config
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
    const allowed = /jpeg|jpg|png|webp|mp4|mov/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext || mime) return cb(null, true);
    cb(new Error('Only jpg/png/webp/mp4/mov allowed'));
  }
});

// ComfyUI bridge
const comfyui = new ComfyUIBridge(
  process.env.COMFYUI_HOST || '127.0.0.1',
  process.env.COMFYUI_PORT || 8188
);

// In-memory job store
const jobs = new Map();

/**
 * POST /api/generate
 * Body: modelImage (file) + clothImage (file)
 * Returns: jobId
 */
app.post('/api/generate', upload.fields([
  { name: 'modelImage', maxCount: 1 },
  { name: 'clothImage', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files || !req.files.modelImage || !req.files.clothImage) {
      return res.status(400).json({ error: 'Both modelImage and clothImage are required' });
    }

    const modelPath = req.files.modelImage[0].path;
    const clothPath = req.files.clothImage[0].path;
    const jobId = uuidv4();

    jobs.set(jobId, {
      id: jobId,
      status: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
      resultUrl: null,
      error: null
    });

    // Process asynchronously
    comfyui.generate(jobId, modelPath, clothPath, {
      onProgress: (progress) => {
        const job = jobs.get(jobId);
        if (job) {
          job.progress = progress;
          job.status = progress >= 100 ? 'processing' : 'processing';
        }
      },
      onComplete: (outputPath) => {
        const job = jobs.get(jobId);
        if (job) {
          job.status = 'completed';
          job.progress = 100;
          job.resultUrl = `/results/${path.basename(outputPath)}`;
        }
      },
      onError: (error) => {
        const job = jobs.get(jobId);
        if (job) {
          job.status = 'failed';
          job.error = error.message || String(error);
        }
      }
    });

    res.json({ jobId, status: 'queued' });
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
  res.json(job);
});

/**
 * GET /api/samples
 * Returns sample images for the UI
 */
app.get('/api/samples', (req, res) => {
  res.json({
    models: [
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/m1.jpg', name: 'model-1' },
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/m2.jpg', name: 'model-2' },
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/m3.jpg', name: 'model-3' }
    ],
    clothes: [
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/t-shirt.png', name: 't-shirt' },
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/dress.png', name: 'dress' },
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/pants.png', name: 'pants' }
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Cloth Swap API running on http://localhost:${PORT}`);
  console.log(`ComfyUI target: ${comfyui.host}:${comfyui.port}`);
});
