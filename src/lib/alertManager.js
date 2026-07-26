import { useOrderStore } from '../store/orderStore';
import { useAlertStore } from '../store/alertStore';
import { stopAlarm } from './audio';
import { Howl } from 'howler';

class AlertManager {
  constructor() {
    this.alarmAudio = null;
    this.voiceSingle = null;
    this.voicePlural = null;
    this.initialized = false;
    this.pendingOrders = new Set();
    this.activeCycleTimeout = null;
    this.currentVoiceNode = null;
    this.cycleState = 'idle'; // 'idle' | 'alarm' | 'announcing' | 'waiting'
    this.lastAcceptedTime = 0;
  }

  initialize() {
    if (this.initialized) return;
    this.initialized = true;

    // Preload audios using Howler
    try {
      this.alarmAudio = new Howl({
        src: ['/alarm.mp3'],
        loop: true,
        volume: 1.0
      });
      
      this.voiceSingle = new Howl({
        src: ['/new_order_voice.mp3'],
        volume: 1.0
      });
      
      this.voicePlural = new Howl({
        src: ['/new_orders_voice.mp3'],
        volume: 1.0
      });
    } catch (e) {
      console.warn('Audio preloading failed:', e);
    }

    let isFirstCall = true;
    let prevPendingStr = '';

    // Subscribe to order store changes using standard Zustand subscribe compatible with all versions
    useOrderStore.subscribe(
      (state) => {
        const dismissed = state.dismissedOrderIds || new Set();
        const isPaidNew = (o) => o?.payment_confirmed && (o.status === 'new' || o.status === 'payment_pending') && !dismissed.has(o.id);
        const currentPending = (state.orders || []).filter(isPaidNew).map(o => o.id);
        const currentPendingStr = currentPending.slice().sort().join(',');
        
        if (isFirstCall) {
          isFirstCall = false;
          this.pendingOrders = new Set(currentPending);
          prevPendingStr = currentPendingStr;
          return;
        }

        if (currentPendingStr !== prevPendingStr) {
          prevPendingStr = currentPendingStr;
          this.updatePendingOrders(currentPending);
        }
      }
    );
  }

  updatePendingOrders(newIds) {
    const prevCount = this.pendingOrders.size;
    const nextSet = new Set(newIds);
    this.pendingOrders = nextSet;

    const alertStore = useAlertStore.getState();

    // If pending list became empty, immediately stop
    if (nextSet.size === 0) {
      if (prevCount > 0) {
        this.stopActiveAlerts();
        // Show thumbs-up acceptance reaction if recently accepted
        if (Date.now() - this.lastAcceptedTime < 10000) {
          alertStore.setMascotState('accepted', 'Order accepted!');
          alertStore.triggerToast('success', 'Order accepted');
          setTimeout(() => {
            if (this.pendingOrders.size === 0) {
              alertStore.setMascotState('idle', '');
              alertStore.minimizeMascot();
            }
          }, 2000);
        } else {
          alertStore.setMascotState('idle', '');
          alertStore.minimizeMascot();
        }
      }
      return;
    }

    // If new orders arrived and we are idle, start alert cycle!
    if (this.cycleState === 'idle') {
      this.startAlertCycle();
    }
  }

  // Set timestamp when user clicks accept to trigger the thumbs-up visual reaction
  markOrderAccepted() {
    this.lastAcceptedTime = Date.now();
  }

  stopActiveAlerts() {
    this.cycleState = 'idle';
    if (this.activeCycleTimeout) {
      clearTimeout(this.activeCycleTimeout);
      this.activeCycleTimeout = null;
    }
    
    // Stop legacy store alarm
    stopAlarm();

    try {
      if (this.alarmAudio) {
        this.alarmAudio.stop();
      }
      if (this.currentVoiceNode) {
        this.currentVoiceNode.stop();
        this.currentVoiceNode = null;
      }
    } catch (e) {
      console.warn('Failed to stop audio:', e);
    }
  }

  playAudio(audioNode, volume) {
    if (!audioNode) return;
    try {
      audioNode.volume(volume);
      audioNode.stop();
      audioNode.play();
    } catch (e) {
      console.warn('Audio playback blocked or failed:', e);
    }
  }

  speakText(text, volume) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = volume;
      
      const voices = window.speechSynthesis.getVoices();
      const inVoice = voices.find(v => v.lang === 'en-IN' || v.name.toLowerCase().includes('india') || v.name.toLowerCase().includes('indian'));
      if (inVoice) utterance.voice = inVoice;
      
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis failed:', e);
    }
  }

  startAlertCycle() {
    if (this.pendingOrders.size === 0) {
      this.cycleState = 'idle';
      return;
    }

    const settings = useAlertStore.getState();
    const mode = settings.alertMode;

    if (mode === 'silent') {
      this.cycleState = 'idle';
      return;
    }

    this.cycleState = 'alarm';
    
    // Phase 1: Alarm for 5 seconds
    if (mode === 'alarm_voice' || mode === 'alarm_only') {
      this.playAudio(this.alarmAudio, settings.alarmVolume);
    }

    this.activeCycleTimeout = setTimeout(() => {
      this.announcementPhase();
    }, 5000);
  }

  announcementPhase() {
    if (this.pendingOrders.size === 0) {
      this.stopActiveAlerts();
      return;
    }

    // Stop alarm audio before voice starts
    try {
      if (this.alarmAudio) {
        this.alarmAudio.pause();
        this.alarmAudio.currentTime = 0;
      }
    } catch (e) {
      console.warn(e);
    }

    const settings = useAlertStore.getState();
    const mode = settings.alertMode;

    this.cycleState = 'announcing';
    
    const count = this.pendingOrders.size;
    const isPlural = count > 1;

    const sentence = isPlural ? settings.customVoicePlural : settings.customVoiceSingle;

    // Animate mascot and display speech bubble
    if (settings.mascotEnabled) {
      settings.setMascotState('new_order', sentence);
    }

    // Trigger toast notification
    settings.triggerToast('info', isPlural ? 'Multiple new orders received' : 'New order received');

    // Play Voice
    if (mode === 'alarm_voice' || mode === 'voice_only') {
      const isDefault = isPlural 
        ? sentence === 'Hey Boss! You have new orders waiting.' 
        : sentence === 'Hey Boss! You have got a new order.';
      
      if (isDefault) {
        const voiceNode = isPlural ? this.voicePlural : this.voiceSingle;
        this.currentVoiceNode = voiceNode;
        this.playAudio(voiceNode, settings.voiceVolume);
      } else {
        this.speakText(sentence, settings.voiceVolume);
      }
    }

    // Wait 5 seconds after voice (assume voice is 2.5s, wait total 5s)
    this.activeCycleTimeout = setTimeout(() => {
      this.waitingPhase();
    }, 5000);
  }

  waitingPhase() {
    if (this.pendingOrders.size === 0) {
      this.stopActiveAlerts();
      return;
    }

    this.cycleState = 'waiting';
    const settings = useAlertStore.getState();

    // Repeat cycle after waiting
    const waitTime = Math.max(1, settings.repeatIntervalSeconds) * 1000;
    this.activeCycleTimeout = setTimeout(() => {
      this.startAlertCycle();
    }, waitTime);
  }
}

export const alertManager = new AlertManager();
