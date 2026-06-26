const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

class BFLProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.bfl.ai/v1';
  }

  /**
   * Generate cloth swap via BFL FLUX VTO API
   */
  async generate(jobId, modelImagePath, clothImagePath, callbacks = {}) {
    const { onProgress, onComplete, onError } = callbacks;

    try {
      // 1. Upload images to temporary hosting
      onProgress?.(10);
      const modelUrl = await this._uploadToTemp(modelImagePath);
      onProgress?.(20);
      const clothUrl = await this._uploadToTemp(clothImagePath);

      // 2. Submit VTO job to BFL
      onProgress?.(30);
      const taskId = await this._submitVTOJob(modelUrl, clothUrl);

      // 3. Poll for result
      onProgress?.(50);
      const resultUrl = await this._pollForResult(taskId, (progress) => {
        onProgress?.(50 + Math.floor(progress * 0.45));
      });

      // 4. Download result
      onProgress?.(95);
      const resultPath = await this._downloadResult(resultUrl, jobId);

      onProgress?.(100);
      onComplete?.(resultPath);

    } catch (error) {
      console.error(`[BFL] Job ${jobId} failed:`, error.message);
      onError?.(error);
    }
  }

  async _uploadToTemp(filePath) {
    // Upload to a temporary file hosting service
    // In production, use your own storage (S3, etc.)
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    // Using temp.sh or similar free file hosting
    // For production, replace with your own upload endpoint
    const response = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
      headers: form.getHeaders(),
      timeout: 30000
    });

    // tmpfiles returns: { status: true, data: { url: "https://tmpfiles.org/..." } }
    // Convert to direct download URL
    let url = response.data?.data?.url;
    if (!url) throw new Error('Failed to upload image');

    // Convert tmpfiles.org view URL to direct download
    url = url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');

    return url;
  }

  async _submitVTOJob(personImageUrl, garmentImageUrl) {
    const response = await axios.post(
      `${this.baseUrl}/flux-vto`,
      {
        person_image_url: personImageUrl,
        garment_image_url: garmentImageUrl,
        prompt: 'A person wearing the garment from the reference image',
        type: 'virtual_try_on'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-key': this.apiKey
        },
        timeout: 30000
      }
    );

    if (!response.data?.id) {
      throw new Error('BFL API did not return a task ID');
    }

    return response.data.id;
  }

  async _pollForResult(taskId, onProgress) {
    const maxAttempts = 120;
    const interval = 2000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await axios.get(`${this.baseUrl}/get_result`, {
          params: { id: taskId },
          headers: { 'x-key': this.apiKey },
          timeout: 10000
        });

        const data = response.data;

        if (data.status === 'ready') {
          const imageUrl = data.result?.sample || data.result?.image || data.result?.[0];
          if (imageUrl) return imageUrl;
          throw new Error('Result URL not found in response');
        }

        if (data.status === 'error') {
          throw new Error(data.error || 'BFL API returned an error');
        }

        // Map BFL progress to our progress (0-1 range)
        const progressMap = {
          'pending': 0.1,
          'processing': 0.5,
          'generating': 0.7,
          'finalizing': 0.9
        };
        onProgress?.(progressMap[data.status] || 0.3);

      } catch (error) {
        if (error.message.includes('BFL')) throw error;
        // Transient errors: continue polling
        console.warn('[BFL] Poll warning:', error.message);
      }

      await new Promise(r => setTimeout(r, interval));
    }

    throw new Error('BFL API polling timed out');
  }

  async _downloadResult(imageUrl, jobId) {
    const resultsDir = path.join(__dirname, '..', 'results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    const ext = path.extname(new URL(imageUrl).pathname) || '.png';
    const outputPath = path.join(resultsDir, `${jobId}${ext}`);

    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'stream',
      timeout: 60000
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`[BFL] Result saved to ${outputPath}`);
        resolve(outputPath);
      });
      writer.on('error', reject);
    });
  }
}

module.exports = { BFLProvider };
