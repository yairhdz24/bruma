use crate::model::VoiceLevel;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::{atomic::{AtomicBool, Ordering}, Arc};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, oneshot};

pub struct Capture {
    pub rate: u32,
    pub receiver: mpsc::Receiver<Vec<u8>>,
    pub failed: Arc<AtomicBool>,
    stop: Arc<AtomicBool>,
    begin: Arc<AtomicBool>,
}
impl Capture {
    pub fn start(&self) { self.begin.store(true, Ordering::Release); }
    pub fn stop(&self) { self.stop.store(true, Ordering::Release); }
}
impl Drop for Capture { fn drop(&mut self) { self.stop(); } }

pub async fn prepare(app: AppHandle) -> Result<Capture, String> {
    let (sender, receiver) = mpsc::channel::<Vec<u8>>(8192);
    let (ready_tx, ready_rx) = oneshot::channel::<Result<u32, String>>();
    let stop = Arc::new(AtomicBool::new(false));
    let begin = Arc::new(AtomicBool::new(false));
    let failed = Arc::new(AtomicBool::new(false));
    let thread_stop = stop.clone();
    let thread_begin = begin.clone();
    let thread_failed = failed.clone();
    // CPAL streams stay on the dedicated thread, including on platforms where Stream is !Send.
    std::thread::spawn(move || {
        let build = || -> Result<(cpal::Stream, u32), String> {
            let device = cpal::default_host().default_input_device().ok_or("No se encontró un micrófono. Conéctalo y vuelve a intentar.")?;
            let config = device.default_input_config().map_err(|_| "No se pudo abrir el micrófono. Revisa el permiso de micrófono de Bruma.")?;
            let rate = config.sample_rate().0;
            let channels = config.channels() as usize;
            let stream_config: cpal::StreamConfig = config.clone().into();
            let stream = match config.sample_format() {
                cpal::SampleFormat::F32 => stream::<f32>(&device, &stream_config, channels, sender, app, thread_failed.clone(), |v| v),
                cpal::SampleFormat::I16 => stream::<i16>(&device, &stream_config, channels, sender, app, thread_failed.clone(), |v| v as f32 / 32768.0),
                cpal::SampleFormat::U16 => stream::<u16>(&device, &stream_config, channels, sender, app, thread_failed.clone(), |v| (v as f32 - 32768.0) / 32768.0),
                _ => return Err("El formato de este micrófono no está disponible. Prueba el micrófono integrado.".into()),
            }.map_err(|_| "No se pudo iniciar el micrófono. Revisa sus permisos en el sistema.")?;
            Ok((stream, rate))
        };
        match build() {
            Ok((stream, rate)) => {
                if ready_tx.send(Ok(rate)).is_err() { return; }
                while !thread_begin.load(Ordering::Acquire) && !thread_stop.load(Ordering::Acquire) { std::thread::sleep(Duration::from_millis(20)); }
                if thread_stop.load(Ordering::Acquire) { return; }
                if stream.play().is_err() { thread_failed.store(true, Ordering::Release); return; }
                while !thread_stop.load(Ordering::Acquire) && !thread_failed.load(Ordering::Acquire) { std::thread::sleep(Duration::from_millis(40)); }
                drop(stream);
            }
            Err(error) => { let _ = ready_tx.send(Err(error)); }
        }
    });
    // The guard also stops a prepared stream if this future is cancelled before startup.
    let mut capture = Capture { rate: 0, receiver, stop, begin, failed };
    let rate = match tokio::time::timeout(Duration::from_secs(30), ready_rx).await {
        Ok(Ok(Ok(rate))) => rate,
        Ok(Ok(Err(error))) => return Err(error),
        _ => return Err("No se pudo preparar el micrófono. Autoriza el micrófono para Bruma y vuelve a intentar.".into()),
    };
    capture.rate = rate;
    Ok(capture)
}

fn stream<T: cpal::SizedSample + Copy + Send + 'static>(device: &cpal::Device, config: &cpal::StreamConfig, channels: usize, sender: mpsc::Sender<Vec<u8>>, app: AppHandle, failed: Arc<AtomicBool>, normalize: fn(T) -> f32) -> Result<cpal::Stream, cpal::BuildStreamError> {
    let stream_failed = failed.clone();
    let mut last_level = Instant::now();
    device.build_input_stream(config, move |data: &[T], _| {
        let mut bytes = Vec::with_capacity(data.len() / channels * 2);
        let mut sum = 0.0f32;
        let mut count = 0;
        for frame in data.chunks_exact(channels) {
            let sample = (frame.iter().map(|s| normalize(*s)).sum::<f32>() / channels as f32).clamp(-1.0, 1.0);
            sum += sample * sample;
            count += 1;
            bytes.extend_from_slice(&((sample * 32767.0) as i16).to_le_bytes());
        }
        if last_level.elapsed() >= Duration::from_millis(65) && count > 0 {
            let rms = (sum / count as f32).sqrt();
            let _ = app.emit("voice:level", VoiceLevel { rms, dbfs: (20.0 * rms.max(0.00001).log10()).max(-100.0), voiced: rms > 0.012 });
            last_level = Instant::now();
        }
        if !bytes.is_empty() && sender.try_send(bytes).is_err() { stream_failed.store(true, Ordering::Release); }
    }, move |_| { failed.store(true, Ordering::Release); }, None)
}
