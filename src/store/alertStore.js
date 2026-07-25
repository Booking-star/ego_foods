import { create } from 'zustand';

const localRead = (key, fallback) => {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? JSON.parse(val) : fallback;
  } catch {
    return fallback;
  }
};

const localWrite = (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error('Failed to write key to localStorage', e);
  }
};

export const useAlertStore = create((set, get) => ({
  // Alert settings
  alertMode: localRead('kitchen-os.alert-mode', 'alarm_voice'), // 'alarm_voice' | 'alarm_only' | 'voice_only' | 'silent'
  alarmVolume: localRead('kitchen-os.alarm-volume', 1.0),
  voiceVolume: localRead('kitchen-os.voice-volume', 1.0),
  mascotEnabled: localRead('kitchen-os.mascot-enabled', true),
  minimizeNotificationEnabled: localRead('kitchen-os.minimize-notification', true),
  repeatIntervalSeconds: localRead('kitchen-os.repeat-interval', 5),

  // Mascot and Speech state
  mascotState: 'idle', // 'idle' | 'new_order' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'low_stock' | 'printer_disconnected' | 'swiggy_import_success'
  speechText: '',
  showMascot: false,
  audioPermissionGranted: localRead('kitchen-os.audio-permission', false),

  // Dynamic context data
  toastMessage: null, // { type, text, id, duration }
  lowStockItemName: '',
  importedSwiggyCount: 0,

  setAlertMode: (mode) => {
    localWrite('kitchen-os.alert-mode', mode);
    set({ alertMode: mode });
  },
  setAlarmVolume: (vol) => {
    localWrite('kitchen-os.alarm-volume', vol);
    set({ alarmVolume: vol });
  },
  setVoiceVolume: (vol) => {
    localWrite('kitchen-os.voice-volume', vol);
    set({ voiceVolume: vol });
  },
  setMascotEnabled: (enabled) => {
    localWrite('kitchen-os.mascot-enabled', enabled);
    set({ mascotEnabled: enabled });
  },
  setMinimizeNotificationEnabled: (enabled) => {
    localWrite('kitchen-os.minimize-notification', enabled);
    set({ minimizeNotificationEnabled: enabled });
  },
  setRepeatIntervalSeconds: (seconds) => {
    localWrite('kitchen-os.repeat-interval', seconds);
    set({ repeatIntervalSeconds: seconds });
  },
  setAudioPermissionGranted: (granted) => {
    localWrite('kitchen-os.audio-permission', granted);
    set({ audioPermissionGranted: granted });
  },

  // Helper actions to trigger UI state updates
  triggerToast: (type, text, duration = 4000) => {
    const id = crypto.randomUUID?.() || Math.random().toString(36).slice(2);
    set({ toastMessage: { id, type, text, duration } });
  },
  clearToast: () => set({ toastMessage: null }),

  setMascotState: (state, text = '') => {
    set({ mascotState: state, speechText: text });
    if (state !== 'idle' && get().mascotEnabled) {
      set({ showMascot: true });
    }
  },
  minimizeMascot: () => {
    set({ showMascot: false, speechText: '' });
  }
}));
