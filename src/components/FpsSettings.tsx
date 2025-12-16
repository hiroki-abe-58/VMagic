import { useState, useCallback } from 'react';
import { FPS_PRESETS, DEFAULT_FPS } from '../lib/presets';

interface FpsSettingsProps {
  currentFps: number | null;
  targetFps: number;
  onTargetFpsChange: (fps: number) => void;
  isDisabled?: boolean;
}

export function FpsSettings({ currentFps, targetFps, onTargetFpsChange, isDisabled }: FpsSettingsProps) {
  const [isCustom, setIsCustom] = useState(false);
  const [customValue, setCustomValue] = useState(targetFps.toString());

  const handlePresetClick = useCallback((fps: number) => {
    setIsCustom(false);
    onTargetFpsChange(fps);
    setCustomValue(fps.toString());
  }, [onTargetFpsChange]);

  const handleCustomClick = useCallback(() => {
    setIsCustom(true);
  }, []);

  const handleCustomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomValue(value);
    
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0 && numValue <= 240) {
      onTargetFpsChange(numValue);
    }
  }, [onTargetFpsChange]);

  const isPresetSelected = (presetFps: number) => {
    return !isCustom && Math.abs(targetFps - presetFps) < 0.01;
  };

  return (
    <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
      <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-neon-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" 
          />
        </svg>
        出力フレームレート設定
      </h2>

      {/* Current FPS indicator */}
      {currentFps !== null && (
        <div className="mb-4 p-3 bg-dark-surface-light rounded-lg">
          <p className="text-xs text-text-secondary">現在のフレームレート</p>
          <p className="text-neon-yellow font-mono text-lg">{currentFps.toFixed(2)} fps</p>
        </div>
      )}

      {/* Presets Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
        {FPS_PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => handlePresetClick(preset.value)}
            disabled={isDisabled}
            className={`
              relative p-3 rounded-lg border transition-all duration-200
              ${isPresetSelected(preset.value)
                ? 'border-neon-yellow bg-neon-yellow/10 text-neon-yellow'
                : 'border-dark-border bg-dark-surface-light text-text-secondary hover:border-neon-yellow/50 hover:text-text-primary'
              }
              ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <p className="font-mono text-sm font-medium">{preset.label}</p>
            <p className="text-xs opacity-70 mt-0.5">{preset.description}</p>
            {isPresetSelected(preset.value) && (
              <div className="absolute top-1 right-1">
                <svg className="w-3 h-3 text-neon-yellow" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" 
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" 
                    clipRule="evenodd" 
                  />
                </svg>
              </div>
            )}
          </button>
        ))}

        {/* Custom Button */}
        <button
          onClick={handleCustomClick}
          disabled={isDisabled}
          className={`
            relative p-3 rounded-lg border transition-all duration-200
            ${isCustom
              ? 'border-neon-yellow bg-neon-yellow/10 text-neon-yellow'
              : 'border-dark-border bg-dark-surface-light text-text-secondary hover:border-neon-yellow/50 hover:text-text-primary'
            }
            ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          <p className="font-mono text-sm font-medium">カスタム</p>
          <p className="text-xs opacity-70 mt-0.5">自由入力</p>
        </button>
      </div>

      {/* Custom Input */}
      {isCustom && (
        <div className="flex items-center gap-3 p-4 bg-dark-surface-light rounded-lg">
          <label className="text-text-secondary text-sm">目標 fps:</label>
          <input
            type="number"
            value={customValue}
            onChange={handleCustomChange}
            disabled={isDisabled}
            min="1"
            max="240"
            step="0.001"
            className={`
              flex-1 bg-dark-bg border border-dark-border rounded-lg px-4 py-2
              font-mono text-lg text-neon-yellow
              focus:border-neon-yellow focus:ring-1 focus:ring-neon-yellow
              ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          />
          <span className="text-text-secondary text-sm">fps</span>
        </div>
      )}

      {/* Target FPS Display */}
      <div className="mt-4 p-4 bg-neon-yellow/5 border border-neon-yellow/30 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">変換後フレームレート</span>
          <span className="text-neon-yellow font-mono text-xl font-bold">
            {targetFps.toFixed(2)} fps
          </span>
        </div>
      </div>
    </div>
  );
}

