const axios = require('axios');
const fs = require('fs');
const path = require('path');

class AgnesBridge {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://apihub.agnes-ai.com';
    this.headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Generate a video from an image via Agnes AI (totally free)
   * @param {string} imagePath - Local path to the image
   * @param {string} prompt - Text prompt for motion/mood
   * @param {object} callbacks - { onComplete(videoUrl), onError(error) }
   */
  async generate(imagePath, prompt, callbacks = {}) {
    const { onComplete, onError } = callbacks;

    try {
      // 1. Convert image to base64 data URI
      const imageDataUri = this._imageToDataUri(imagePath);

      // 2. Create video task
      const task = await this._createTask(imageDataUri, prompt);
      const videoId = task.video_id || task.taskId;
      
      if (!videoId) {
        throw new Error('No video_id returned from Agnes AI');
      }

      // 3. Poll for completion
      const videoUrl = await this._pollForResult(videoId);
      
      onComplete?.(videoUrl);

    } catch (error) {
      console.error(`[AgnesAI] Generation failed:`, error.message);
      onError?.(error);
    }
  }

  /**
   * Convert a local image file to base64 data URI
   */
  _imageToDataUri(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp'
    };
    const mime = mimeMap[ext] || 'image/png';
    const data = fs.readFileSync(filePath);
    const base64 = data.toString('base64');
    return `data:${mime};base64,${base64}`;
  }

  /**
   * Create a video generation task
   * @param {string} imageDataUri - Base64 data URI of the image
   * @param {string} prompt - Motion/mood description
   * @returns {object} { task_id, video_id, status }
   */
  async _createTask(imageDataUri, prompt) {
    const payload = {
      model: 'agnes-video-v2.0',
      prompt: prompt || 'gentle motion, cinematic camera movement, natural flow',
      image: imageDataUri,
      num_frames: 81,   // ~3.4 seconds at 24fps
      frame_rate: 24,
      width: 1152,
      height: 768
    };

    const response = await axios.post(
      `${this.baseUrl}/v1/videos`,
      payload,
      { headers: this.headers, timeout: 30000 }
    );

    console.log('[AgnesAI] Task created:', response.data);
    return response.data;
  }

  /**
   * Poll for video result
   * @param {string} videoId - The video_id to poll
   * @returns {string} Public video URL
   */
  async _pollForResult(videoId) {
    const maxAttempts = 120; // ~10 minutes at 5s intervals
    const interval = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Primary polling endpoint
        const response = await axios.get(
          `${this.baseUrl}/agnesapi?video_id=${videoId}`,
          { headers: this.headers, timeout: 10000 }
        );

        const data = response.data;
        console.log(`[AgnesAI] Poll attempt ${attempt + 1}:`, data.status);

        if (data.status === 'completed') {
          // The video URL is in remixed_from_video_id (despite the misleading name)
          const videoUrl = data.remixed_from_video_id || data.video_url;
          if (videoUrl) return videoUrl;
        }

        if (data.status === 'failed') {
          throw new Error(data.error || data.message || 'Video generation failed');
        }

      } catch (error) {
        // If primary endpoint fails, try legacy endpoint
        if (error.response?.status === 404 || error.code === 'ERR_BAD_REQUEST') {
          try {
            const legacyResp = await axios.get(
              `${this.baseUrl}/v1/videos/${videoId}`,
              { headers: this.headers, timeout: 10000 }
            );
            const data = legacyResp.data;
            
            if (data.status === 'completed') {
              const videoUrl = data.video_url || data.remixed_from_video_id;
              if (videoUrl) return videoUrl;
            }
            if (data.status === 'failed') {
              throw new Error(data.error || data.message || 'Video generation failed');
            }
          } catch (legacyErr) {
            if (legacyErr.message.includes('failed')) throw legacyErr;
            // Ignore 404s during polling
          }
        } else {
          // Real error (not 404), rethrow
          throw error;
        }
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Timeout: Agnes AI did not complete within 10 minutes');
  }
}

module.exports = { AgnesBridge };
