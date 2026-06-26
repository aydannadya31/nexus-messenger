const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

class ComfyUIBridge {
  constructor(host = '127.0.0.1', port = 8188) {
    this.host = host;
    this.port = port;
    this.baseUrl = `http://${host}:${port}`;
  }

  /**
   * Generate a video from an image via ComfyUI (CogVideoX)
   * @param {string} jobId - Unique job identifier
   * @param {string} imagePath - Path to the input image
   * @param {string} prompt - Text prompt for motion
   * @param {object} callbacks - { onProgress, onComplete, onError }
   */
  async generate(jobId, imagePath, prompt, callbacks = {}) {
    const { onProgress, onComplete, onError } = callbacks;

    try {
      // 1. Check ComfyUI is running
      await this._checkHealth();
      onProgress?.(10);

      // 2. Upload image to ComfyUI
      const imageName = await this._uploadImage(imagePath);
      onProgress?.(25);

      // 3. Queue the CogVideoX I2V workflow
      const promptId = await this._queueWorkflow(imageName, prompt);
      onProgress?.(40);

      // 4. Poll for results
      const outputVideos = await this._pollForResults(promptId, (progress) => {
        onProgress?.(40 + Math.floor(progress * 0.55));
      });

      // 5. Download the result video
      onProgress?.(95);
      if (!outputVideos || outputVideos.length === 0) {
        throw new Error('No output video generated');
      }

      const resultPath = await this._downloadResult(outputVideos[0], jobId);
      onProgress?.(100);
      onComplete?.(resultPath);

    } catch (error) {
      console.error(`[ComfyUI] Job ${jobId} failed:`, error.message);
      onError?.(error);
    }
  }

  /**
   * Check if ComfyUI server is reachable
   */
  async _checkHealth() {
    try {
      await axios.get(`${this.baseUrl}/system_stats`, { timeout: 5000 });
    } catch (error) {
      throw new Error(
        `Cannot connect to ComfyUI at ${this.baseUrl}. ` +
        `Make sure ComfyUI is running. (${error.message})`
      );
    }
  }

  /**
   * Upload an image to ComfyUI's input folder
   */
  async _uploadImage(filePath) {
    const fileName = path.basename(filePath);
    const form = new FormData();
    form.append('image', fs.createReadStream(filePath), fileName);
    form.append('overwrite', 'true');

    const response = await axios.post(
      `${this.baseUrl}/upload/image`,
      form,
      {
        headers: form.getHeaders(),
        timeout: 30000
      }
    );

    return response.data.name || fileName;
  }

  /**
   * Queue a CogVideoX I2V workflow in ComfyUI
   */
  async _queueWorkflow(imageName, prompt) {
    const workflowPath = path.join(__dirname, '..', 'comfyui', 'workflow.json');
    if (!fs.existsSync(workflowPath)) {
      throw new Error('ComfyUI workflow not found at comfyui/workflow.json');
    }

    const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));

    // Replace placeholders in the workflow
    for (const nodeId of Object.keys(workflow)) {
      const node = workflow[nodeId];
      if (!node || !node.inputs) continue;

      if (node.inputs.image === '__INPUT_IMAGE__') {
        node.inputs.image = imageName;
      }
      if (node.inputs.text === '__PROMPT__') {
        node.inputs.text = prompt || 'gentle motion, cinematic camera movement';
      }
    }

    const payload = {
      prompt: workflow,
      number: 1
    };

    const response = await axios.post(`${this.baseUrl}/prompt`, payload, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });

    return response.data.prompt_id;
  }

  /**
   * Poll ComfyUI for workflow completion
   */
  async _pollForResults(promptId, onProgress) {
    const maxAttempts = 600; // ~10 minutes at 1s intervals
    const interval = 1000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await axios.get(
          `${this.baseUrl}/history/${promptId}`,
          { timeout: 5000 }
        );

        const history = response.data;
        if (history[promptId]) {
          const outputs = history[promptId].outputs;
          const videos = [];

          for (const nodeId of Object.keys(outputs)) {
            const nodeOutput = outputs[nodeId];
            if (nodeOutput.videos) {
              videos.push(...nodeOutput.videos);
            }
            // Some ComfyUI setups use 'media' or 'files' key
            if (nodeOutput.media) {
              videos.push(...nodeOutput.media);
            }
            // Also check for gifs (if output is animated gif)
            if (nodeOutput.gifs) {
              videos.push(...nodeOutput.gifs.map(g => ({ ...g, filename: g.filename })));
            }
          }

          if (videos.length > 0) {
            return videos;
          }
        }
      } catch (error) {
        if (error.response?.status !== 404) {
          console.warn('[ComfyUI] Poll warning:', error.message);
        }
      }

      // Estimate progress from queue
      try {
        const queueResp = await axios.get(
          `${this.baseUrl}/queue`,
          { timeout: 3000 }
        );
        const queueData = queueResp.data;
        const running = queueData.queue_running || [];
        const pending = queueData.queue_pending || [];
        
        const position = running.length + pending.length;
        const progress = position === 0 ? 0.9 : Math.max(0, 1 - (position / 5));
        onProgress?.(progress);
      } catch {
        // ignore queue check failures
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Timeout waiting for ComfyUI generation');
  }

  /**
   * Download result video from ComfyUI to local results folder
   */
  async _downloadResult(videoInfo, jobId) {
    const resultsDir = path.join(__dirname, 'results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    const ext = path.extname(videoInfo.filename) || '.mp4';
    const outputPath = path.join(resultsDir, `${jobId}${ext}`);

    const response = await axios({
      method: 'GET',
      url: `${this.baseUrl}/view`,
      params: {
        filename: videoInfo.filename,
        subfolder: videoInfo.subfolder || '',
        type: videoInfo.type || 'output'
      },
      responseType: 'stream',
      timeout: 60000
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(outputPath));
      writer.on('error', reject);
    });
  }
}

module.exports = { ComfyUIBridge };
