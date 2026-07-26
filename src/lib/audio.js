import { Howl } from 'howler';

let alarm;
let fallbackContext;
let oscillator;
let fallbackGain;
let fallbackPulse;

function getAlarm() {
  if (!alarm) {
    alarm = new Howl({
      src: ['/alarm.mp3'],
      loop: true,
      volume: 1.0
    });
  }
  return alarm;
}

function startFallbackTone() {
  if (oscillator) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  fallbackContext = fallbackContext || new AudioContext();
  fallbackContext.resume?.();
  oscillator = fallbackContext.createOscillator();
  fallbackGain = fallbackContext.createGain();
  oscillator.type = 'square';
  oscillator.frequency.value = 1050;
  fallbackGain.gain.value = 0.22;
  oscillator.connect(fallbackGain).connect(fallbackContext.destination);
  oscillator.start();
  fallbackPulse = window.setInterval(() => {
    if (!fallbackGain) return;
    fallbackGain.gain.value = fallbackGain.gain.value > 0 ? 0 : 0.22;
  }, 450);
}

export function startAlarm() {
  const howl = getAlarm();
  if (!howl.playing()) howl.play();
  window.setTimeout(() => {
    if (!howl.playing()) startFallbackTone();
  }, 250);
}

export function stopAlarm() {
  if (alarm) alarm.stop();
  if (fallbackPulse) {
    window.clearInterval(fallbackPulse);
    fallbackPulse = null;
  }
  if (oscillator) {
    oscillator.stop();
    oscillator.disconnect();
    oscillator = null;
  }
  fallbackGain = null;
}

export function unlockAudio() {
  try {
    const howl = getAlarm();
    if (howl && howl.ctx && howl.ctx.state === 'suspended') {
      howl.ctx.resume().catch(console.error);
    }
  } catch (err) {
    console.error('Failed to unlock audio context:', err);
  }
}
