import type { FpsPreset } from '../types/video';

export const FPS_PRESETS: FpsPreset[] = [
  {
    label: '24 fps',
    value: 24,
    description: '映画 / シネマ',
  },
  {
    label: '25 fps',
    value: 25,
    description: 'PAL',
  },
  {
    label: '29.97 fps',
    value: 29.97,
    description: 'NTSC',
  },
  {
    label: '30 fps',
    value: 30,
    description: '標準',
  },
  {
    label: '50 fps',
    value: 50,
    description: 'PAL ハイフレーム',
  },
  {
    label: '59.94 fps',
    value: 59.94,
    description: 'NTSC ハイフレーム',
  },
  {
    label: '60 fps',
    value: 60,
    description: 'ゲーム / スムーズ',
  },
];

export const DEFAULT_FPS = 60;

