export const toBase64 = (str: string) => btoa(unescape(encodeURIComponent(str)));
export const fromBase64 = (b64: string) => decodeURIComponent(escape(atob(b64)));

export const emojiCategories: Record<string, string[]> = {
  sik: ['😀','😂','🤣','😍','🥰','😘','😎','🥳','😤','😭','😱','🤔','🫡','😴','🙄','😏','🤤','🤩','🥺','😈','💀','🤡','👻','👽','🤖'],
  ele: ['👍','👎','👏','🙏','🤝','💪','🫶','✌️','👋','🫰','🤞','👊','✊','🤟','🦾'],
  kal: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❤️‍🔥','💕','💖','💗','💓','💝'],
  dog: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦅','🦆'],
  yiye: ['🍕','🍔','🍟','🌭','🍿','🍩','🍪','🎂','🍰','🧁','🍫','🍬','☕','🍵','🧃','🥤','🍺','🍷'],
  nes: ['⚽','🏀','🏈','🎮','🎯','🎲','🏆','🎪','🎨','🎬','🎤','🎧','🎸','🎹','🎺','🎵','🔔','📱','💻','📷'],
  diger: ['🎉','🎊','🎈','🎁','🎀','⭐','🌟','✨','💫','🔥','🌈','☀️','🌙','❄️','🌸','🌺','🎶','💫','💎','🏆'],
};

const loadHtmlImage = (url: string, timeoutMs = 5000) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = document.createElement('img');
  const timer = window.setTimeout(() => reject(new Error('image timeout')), timeoutMs);
  img.crossOrigin = 'anonymous';
  img.onload = () => { window.clearTimeout(timer); resolve(img); };
  img.onerror = () => { window.clearTimeout(timer); reject(new Error('image load failed')); };
  img.src = url;
});

const htmlImageToJpegDataUrl = (img: HTMLImageElement, maxPx = 800) => {
  const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight, 1));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas ctx');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
};

const fileToDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result as string);
  r.onerror = () => reject(new Error('file read failed'));
  r.readAsDataURL(file);
});

export const compressImageToDataUrl = async (file: File, maxLen = 800 * 1024): Promise<string> => {
  const raw = await fileToDataUrl(file);
  if (raw.length <= maxLen) return raw;
  try {
    const img = await loadHtmlImage(raw);
    let maxPx = Math.max(img.naturalWidth, img.naturalHeight);
    let quality = 0.85;
    let best = raw;
    for (let i = 0; i < 8; i++) {
      const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight, 1));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = c.getContext('2d');
      if (!ctx) break;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL('image/jpeg', quality);
      if (out.length < best.length) best = out;
      if (out.length <= maxLen) return out;
      maxPx = Math.floor(maxPx * 0.7);
      quality = Math.max(0.5, quality - 0.1);
      if (maxPx < 160) break;
    }
    return best;
  } catch {
    return raw;
  }
};

export const compressVideoToDataUrl = async (file: Blob, maxLen = 1500 * 1024): Promise<string> => {
  const raw = await fileToDataUrl(file);
  if (raw.length <= maxLen) return raw;
  try {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('video load failed'));
    });
    const duration = Math.min(video.duration || 0, 15);
    const scale = Math.min(1, 480 / (video.videoWidth || 480));
    const w = Math.max(1, Math.round((video.videoWidth || 480) * scale));
    const h = Math.max(1, Math.round((video.videoHeight || 360) * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) { URL.revokeObjectURL(url); return raw; }
    const stream = c.captureStream(15);
    try {
      const vs = (video as any).captureStream?.() as MediaStream | undefined;
      if (vs) for (const t of vs.getAudioTracks()) stream.addTrack(t);
    } catch { /* no audio track */ }
    const mime = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 400000 });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise<void>(res => { rec.onstop = () => res(); });
    rec.start(200);
    video.currentTime = 0;
    await video.play();
    await new Promise<void>(resolve => {
      const draw = () => {
        ctx.drawImage(video, 0, 0, w, h);
        if (video.currentTime >= duration || video.ended) {
          video.pause();
          resolve();
          return;
        }
        requestAnimationFrame(draw);
      };
      draw();
    });
    rec.stop();
    await stopped;
    URL.revokeObjectURL(url);
    const blob = new Blob(chunks, { type: 'video/webm' });
    const out = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error('read failed'));
      r.readAsDataURL(blob);
    });
    return out.length <= maxLen || out.length < raw.length ? out : raw;
  } catch {
    return raw;
  }
};
