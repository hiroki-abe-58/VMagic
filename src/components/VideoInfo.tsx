import type { VideoInfo as VideoInfoType } from '../types/video';
import { formatFileSize, formatDuration, formatBitrate } from '../lib/tauri-commands';

interface VideoInfoProps {
  info: VideoInfoType;
}

export function VideoInfo({ info }: VideoInfoProps) {
  return (
    <div className="bg-dark-surface rounded-xl p-6 border border-dark-border">
      <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-neon-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
          />
        </svg>
        入力動画情報
      </h2>

      {/* Filename */}
      <div className="mb-4 pb-4 border-b border-dark-border">
        <p className="text-sm text-text-secondary mb-1">ファイル名</p>
        <p className="text-text-primary font-mono text-sm truncate" title={info.filename}>
          {info.filename}
        </p>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Frame Rate */}
        <InfoItem 
          label="フレームレート" 
          value={`${info.fps.toFixed(2)} fps`}
          highlight
        />

        {/* Duration */}
        <InfoItem 
          label="総尺" 
          value={formatDuration(info.duration)}
          subValue={`${info.duration.toFixed(3)} 秒`}
          highlight
        />

        {/* Resolution */}
        <InfoItem 
          label="解像度" 
          value={`${info.width} x ${info.height}`}
          subValue={getResolutionLabel(info.width, info.height)}
        />

        {/* Codec */}
        <InfoItem 
          label="コーデック" 
          value={info.codec.toUpperCase()}
        />

        {/* File Size */}
        <InfoItem 
          label="ファイルサイズ" 
          value={formatFileSize(info.file_size)}
        />

        {/* Bitrate */}
        <InfoItem 
          label="ビットレート" 
          value={formatBitrate(info.bitrate)}
        />
      </div>
    </div>
  );
}

interface InfoItemProps {
  label: string;
  value: string;
  subValue?: string;
  highlight?: boolean;
}

function InfoItem({ label, value, subValue, highlight }: InfoItemProps) {
  return (
    <div className="bg-dark-surface-light rounded-lg p-3">
      <p className="text-xs text-text-secondary mb-1">{label}</p>
      <p className={`font-mono text-sm ${highlight ? 'text-neon-yellow' : 'text-text-primary'}`}>
        {value}
      </p>
      {subValue && (
        <p className="text-xs text-text-muted mt-0.5">{subValue}</p>
      )}
    </div>
  );
}

function getResolutionLabel(width: number, height: number): string {
  const pixels = width * height;
  
  if (pixels >= 3840 * 2160) return '4K UHD';
  if (pixels >= 2560 * 1440) return 'QHD';
  if (pixels >= 1920 * 1080) return 'Full HD';
  if (pixels >= 1280 * 720) return 'HD';
  if (pixels >= 854 * 480) return 'SD';
  return '';
}

