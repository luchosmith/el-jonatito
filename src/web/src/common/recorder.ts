// Records a short voice clip with MediaRecorder.
export interface Recording {
  stop: () => Promise<Blob>;
}

export async function startRecording(maxMs = 15_000): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((resolve) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: (rec.mimeType || 'audio/webm').split(';')[0] }));
    };
  });
  rec.start(250);
  const timer = setTimeout(() => rec.state !== 'inactive' && rec.stop(), maxMs);
  return {
    stop: () => {
      clearTimeout(timer);
      if (rec.state !== 'inactive') rec.stop();
      return done;
    },
  };
}
