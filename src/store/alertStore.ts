import { create } from 'zustand';
import { alertService, Alert } from '@/services/alertService';

interface AlertStore {
  alerts: Alert[];
  addAlert: (alert: Alert) => void;
  removeAlert: (id: string) => void;
  clearAlerts: () => void;
}

export const useAlertStore = create<AlertStore>((set) => ({
  alerts: [],
  
  addAlert: (alert) => {
    set((state) => ({
      alerts: [...state.alerts, alert],
    }));
  },
  
  removeAlert: (id) => {
    set((state) => ({
      alerts: state.alerts.filter((alert) => alert.id !== id),
    }));
  },
  
  clearAlerts: () => {
    set({ alerts: [] });
  },
}));

// Connect alert service to store
alertService.onAlert((alert) => {
  useAlertStore.getState().addAlert(alert);
});

alertService.onDismiss((alert) => {
  useAlertStore.getState().removeAlert(alert.id);
});