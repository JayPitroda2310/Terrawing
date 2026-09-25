import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameManagerContext } from '@/app/GameManagerContext';
import type { GameManager } from '@/game/core/GameManager';
import { Screen } from '@/game/core/GameState';
import { useMissionStore } from '@/store/missionStore';
import { useProgressStore } from '@/store/progressStore';
import { useSettingsStore } from '@/store/settingsStore';
import { createDefaultSave } from '@/services/save/saveSchema';
import { BatteryIndicator } from './hud/BatteryIndicator';
import { ObjectiveTracker } from './hud/ObjectiveTracker';
import { MainMenu } from './menus/MainMenu';
import { SettingsMenu } from './menus/SettingsMenu';

function fakeManager() {
  return {
    audio: { play: vi.fn() },
    openBriefing: vi.fn(),
    navigate: vi.fn(),
    openSettings: vi.fn(),
    closeSettings: vi.fn(),
  } as unknown as GameManager & {
    openBriefing: ReturnType<typeof vi.fn>;
    navigate: ReturnType<typeof vi.fn>;
  };
}

function renderWithManager(ui: React.ReactElement, manager = fakeManager()) {
  render(<GameManagerContext.Provider value={manager}>{ui}</GameManagerContext.Provider>);
  return manager;
}

describe('MainMenu', () => {
  beforeEach(() => useProgressStore.getState().setProgress(createDefaultSave().progress));

  it('shows the title and routes the menu buttons', () => {
    const manager = renderWithManager(<MainMenu />);
    expect(screen.getByRole('heading', { name: 'TERRAWING' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /start mission/i }));
    expect(manager.openBriefing).toHaveBeenCalledWith('mission-01');
    fireEvent.click(screen.getByRole('button', { name: /mission select/i }));
    expect(manager.navigate).toHaveBeenCalledWith(Screen.MISSION_SELECT);
    fireEvent.click(screen.getByRole('button', { name: /credits/i }));
    expect(manager.navigate).toHaveBeenCalledWith(Screen.CREDITS);
  });

  it('shows the saved best result', () => {
    useProgressStore.getState().setProgress({
      unlocked: ['mission-01'],
      missions: {
        'mission-01': {
          completed: true,
          attempts: 2,
          bestTimeSeconds: 522,
          bestScore: 8800,
          bestStars: 2,
        },
      },
    });
    renderWithManager(<MainMenu />);
    expect(screen.getByText(/08:42/)).toBeInTheDocument();
  });
});

describe('ObjectiveTracker', () => {
  it('conveys status with glyphs and accessible labels, not colour alone', () => {
    useMissionStore.getState().setObjectives([
      {
        id: 'a',
        label: 'Deploy TerraWing',
        status: 'completed',
        optional: false,
        detail: null,
        completedAt: 0,
      },
      {
        id: 'b',
        label: 'Locate Survivor A',
        status: 'active',
        optional: false,
        detail: '142 m',
        completedAt: null,
      },
      {
        id: 'c',
        label: 'Complete extraction',
        status: 'locked',
        optional: false,
        detail: null,
        completedAt: null,
      },
    ]);
    render(<ObjectiveTracker />);
    expect(screen.getByLabelText('Deploy TerraWing, completed')).toHaveTextContent('✓');
    expect(screen.getByLabelText('Locate Survivor A, active')).toHaveTextContent('142 m');
    expect(screen.getByLabelText('Complete extraction, locked')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });
});

describe('BatteryIndicator', () => {
  it('shows percentage and a text status at critical levels', () => {
    render(<BatteryIndicator value={8.4} level="critical" charging={false} rate={0.2} />);
    expect(screen.getByRole('meter', { name: 'Battery' })).toHaveAttribute('aria-valuenow', '8');
    expect(screen.getByText('8%')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('indicates charging', () => {
    render(<BatteryIndicator value={40} level="normal" charging rate={-6} />);
    expect(screen.getByText(/charging/i)).toBeInTheDocument();
  });
});

describe('SettingsMenu', () => {
  beforeEach(() => useSettingsStore.getState().resetDefaults());

  it('updates graphics quality and rebinds keys', () => {
    renderWithManager(<SettingsMenu />);
    fireEvent.click(screen.getByRole('radio', { name: 'High' }));
    expect(useSettingsStore.getState().settings.graphics).toBe('high');

    fireEvent.click(screen.getByRole('tab', { name: 'Controls' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rebind Scanner pulse' }));
    fireEvent.keyDown(window, { code: 'KeyR' });
    expect(useSettingsStore.getState().settings.keyBindings.scan).toEqual(['KeyR']);

    fireEvent.click(screen.getByRole('tab', { name: 'Gameplay' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Reduced motion' }));
    expect(useSettingsStore.getState().settings.reducedMotion).toBe(true);
  });
});
