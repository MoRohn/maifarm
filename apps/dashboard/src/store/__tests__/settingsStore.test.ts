import { act } from '@testing-library/react';
import { settingsService } from '@/services/settingsService';
import { useSettingsStore } from '../settingsStore';

jest.mock('@/services/settingsService', () => ({
  settingsService: {
    getAll: jest.fn(),
    update: jest.fn(),
  },
}));

const mockedSettingsService = settingsService as jest.Mocked<typeof settingsService>;
const initialState = useSettingsStore.getState();

const resetStore = () => {
  useSettingsStore.setState(initialState, true);
  useSettingsStore.persist?.clearStorage?.();
};

describe('settings store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  it('loads settings from the backend and merges defaults', async () => {
    mockedSettingsService.getAll.mockResolvedValue({
      ui: {
        system: {
          performance: {
            maxConcurrentAgents: 6,
            lowPowerMode: true,
          },
        },
        user: {
          language: {
            current: 'fr',
            timeFormat: '24h',
          },
        },
      },
    });

    await act(async () => {
      await useSettingsStore.getState().loadSettings();
    });

    const state = useSettingsStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.loading).toBe(false);
    expect(state.settings.system?.performance?.maxConcurrentAgents).toBe(6);
    expect(state.settings.system?.performance?.lowPowerMode).toBe(true);
    expect(state.language).toBe('fr');
    expect(state.settings.user?.language?.timeFormat).toBe('24h');
    expect(state.dirty).toBe(false);
  });

  it('saves settings through the service and clears dirty flag', async () => {
    mockedSettingsService.getAll.mockResolvedValue({ ui: {} });
    mockedSettingsService.update.mockResolvedValue();

    await act(async () => {
      await useSettingsStore.getState().loadSettings();
    });

    act(() => {
      useSettingsStore.getState().setLanguage('es');
    });

    expect(useSettingsStore.getState().dirty).toBe(true);

    await act(async () => {
      await useSettingsStore.getState().saveSettings();
    });

    expect(mockedSettingsService.update).toHaveBeenCalledWith(
      'ui',
      expect.objectContaining({
        user: expect.objectContaining({
          language: expect.objectContaining({ current: 'es' }),
        }),
      })
    );

    expect(useSettingsStore.getState().dirty).toBe(false);
    expect(useSettingsStore.getState().saving).toBe(false);
  });
});
