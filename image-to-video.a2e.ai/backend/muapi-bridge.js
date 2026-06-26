const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

class MuapiBridge {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.muapi.ai/api/v1';
    this.headers = { 'x-api-key': apiKey };
  }

  /**
   * Generate video from image via Muapi.ai (HappyHorse 1.0 i2v)
   * Falls back to cheaper models if primary model fails.
   * @param {string} imagePath - Local path to the image
   * @param {string} prompt - Text prompt
   * @param {object} callbacks - { onComplete(videoUrl), onError(error) }
   */
  async generate(imagePath, prompt, callbacks = {}) {
    const { onComplete, onError } = callbacks;

    try {
      // 1. Upload image to Muapi
      const imageUrl = await this._uploadFile(imagePath);

      // 2. Define model endpoints to try in order (most capable first)
      const models = [
        {
          name: 'HappyHorse 1.0 I2V 1080p',
          endpoint: 'happy-horse-1-image-to-video-1080p',
          body: {
            prompt: prompt || '@image1 — gentle motion, cinematic flow',
            images_list: [imageUrl],
            aspect_ratio: '16:9',
            duration: 5
          }
        },
        {
          name: 'HappyHorse 1.0 I2V 720p',
          endpoint: 'happy-horse-1-image-to-video-720p',
          body: {
            prompt: prompt || '@image1 — gentle motion, cinematic flow',
            images_list: [imageUrl],
            aspect_ratio: '16:9',
            duration: 5
          }
        },
        {
          name: 'HappyHorse 1.1 I2V 720p',
          endpoint: 'happy-horse-1.1-image-to-video-720p',
          body: {
            prompt: prompt || '@image1 — gentle motion, cinematic flow',
            images_list: [imageUrl],
            aspect_ratio: '16:9',
            duration: 5
          }
        }
      ];

      let lastError = null;

      for (const model of models) {
        try {
          console.log(`[Muapi] Trying model: ${model.name}`);
          const requestId = await this._submitTask(model);
          const videoUrl = await this._pollForResult(requestId);
          console.log(`[Muapi] Success with ${model.name}`);
          onComplete?.(videoUrl);
          return;
        } catch (err) {
          console.warn(`[Muapi] ${model.name} failed:`, err.message);
          lastError = err;
          // Continue to next model
        }
      }

      throw lastError || new Error('All Muapi models failed');

    } catch (error) {
      console.error(`[Muapi] All models failed:`, error.message);
      onError?.(error);
    }
  }

  /**
   * Upload a file to Muapi and get a hosted URL
   */
  async _uploadFile(filePath) {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    const response = await axios.post(
      `${this.baseUrl}/upload_file`,
      form,
      {
        headers: { ...this.headers, ...form.getHeaders() },
        timeout: 30000
      }
    );

    return response.data.url;
  }

  /**
   * Submit a video generation task
   * @param {object} model - { name, endpoint, body }
   * @returns {string} request_id for polling
   */
  async _submitTask(model) {
    const response = await axios.post(
      `${this.baseUrl}/${model.endpoint}`,
      model.body,
      {
        headers: { ...this.headers, 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    const data = response.data;
    const requestId = data.request_id || data.id;
    
    if (!requestId) {
      throw new Error(`No request_id from ${model.name}: ${JSON.stringify(data)}`);
    }

    return requestId;
  }

  /**
   * Poll for video result
   * @param {string} requestId
   * @returns {string} Video URL
   */
  async _pollForResult(requestId) {
    const maxAttempts = 120; // ~10 minutes at 5s intervals
    const interval = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await axios.get(
          `${this.baseUrl}/predictions/${requestId}/result`,
          { headers: this.headers, timeout: 10000 }
        );

        const data = response.data;
        console.log(`[Muapi] Poll ${attempt + 1}:`, data.status);

        if (data.status === 'completed') {
          const videoUrl = data.output?.video || data.output?.url || data.video_url;
          if (videoUrl) return videoUrl;
        }

        if (data.status === 'failed') {
          throw new Error(data.error || data.message || 'Generation failed');
        }

        // Also try the status endpoint if result endpoint returns weird data
        if (data.status === 'processing' || data.status === 'queued') {
          // continue polling
        }

      } catch (error) {
        if (error.message.includes('failed')) throw error;
        // Transient errors: continue polling
        if (attempt < 5) {
          // Short wait for first few retries on connection issues
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Timeout waiting for Muapi video generation');
  }
}

module.exports = { MuapiBridge };
