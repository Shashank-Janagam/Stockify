import React, { useRef } from 'react';
import './ReplayControls.css';

interface ReplayControlsProps {
  isActive: boolean;
  isDataLoaded: boolean;
  selectedDate: string;
  simulatedTime: number | null;
  speed: number;
  onToggleActive: () => void;
  onDateChange: (date: string) => void;
  onSpeedChange: (speed: number) => void;
  onPlayPause: () => void;
  onLoadData: () => void;
  isPlaying: boolean;
  totalTicks?: number;
  currentTick?: number;
  onSeek?: (index: number) => void;
}

// Generate the last 7 valid weekdays (excluding today)
function getLast7Weekdays(): { label: string; value: string }[] {
  const days: { label: string; value: string }[] = [];
  const d = new Date();
  d.setDate(d.getDate() - 1); // Start from yesterday
  while (days.length < 7) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) { // Skip Saturday(6) and Sunday(0)
      const val = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
      days.push({ value: val, label });
    }
    d.setDate(d.getDate() - 1);
  }
  return days;
}

function formatIST(ts: number | null): string {
  if (!ts) return '--:--';
  // ts is already shifted by +5.5h in loadSimulationData
  const d = new Date(ts);
  const h = d.getUTCHours().toString().padStart(2, '0');
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export default function ReplayControls({
  isActive,
  isDataLoaded,
  selectedDate,
  simulatedTime,
  speed,
  onToggleActive,
  onDateChange,
  onSpeedChange,
  onPlayPause,
  onLoadData,
  isPlaying,
  totalTicks = 0,
  currentTick = -1,
  onSeek,
}: ReplayControlsProps) {

  const days = getLast7Weekdays();
  const trackRef = useRef<HTMLDivElement>(null);

  // Custom drag-to-seek handler
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current || !onSeek || totalTicks === 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(Math.round(pct * (totalTicks - 1)));
  };

  const handleTrackMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      if (!trackRef.current || !onSeek) return;
      const rect = trackRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      onSeek(Math.round(pct * (totalTicks - 1)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const progressPct = totalTicks > 0 && currentTick >= 0
    ? (currentTick / (totalTicks - 1)) * 100
    : 0;

  if (!isActive) {
    return (
      <div className="replay-launcher-bar">
        <button className="start-replay-btn" onClick={onToggleActive}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Market Replay
        </button>
      </div>
    );
  }

  return (
    <div className="replay-controls-bar">
      {!isDataLoaded ? (
        /* ── Date picker state ── */
        <div className="rc-setup-row">
          <span className="replay-badge">REPLAY</span>
          <div className="rc-date-group">
            <label className="rc-label">Select Day</label>
            <select
              className="rc-date-select"
              value={selectedDate}
              onChange={e => onDateChange(e.target.value)}
            >
              {days.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <button className="rc-load-btn" onClick={onLoadData}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-3.14" />
            </svg>
            Load
          </button>
          <button className="rc-exit-btn" onClick={onToggleActive}>✕</button>
        </div>
      ) : (
        /* ── Playback state ── */
        <div className="rc-play-row">
          {/* Play/Pause */}
          <button className="rc-play-btn" onClick={onPlayPause} title={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </button>

          {/* Time label */}
          <span className="rc-time">{formatIST(simulatedTime)}</span>

          {/* Custom timeline scrubber */}
          <div className="rc-timeline-wrap">
            <span className="rc-tl-label">09:15</span>
            <div
              className="rc-track"
              ref={trackRef}
              onClick={handleTrackClick}
              onMouseDown={handleTrackMouseDown}
            >
              <div className="rc-track-bg" />
              <div className="rc-track-fill" style={{ width: `${progressPct}%` }} />
              <div
                className="rc-thumb"
                style={{ left: `${progressPct}%` }}
                title={formatIST(simulatedTime)}
              >
                <div className="rc-thumb-tooltip">{formatIST(simulatedTime)}</div>
              </div>
            </div>
            <span className="rc-tl-label">15:30</span>
          </div>

          {/* Speed selector */}
          <div className="rc-speed-group">
            {[1, 2, 5, 10, 20].map(s => (
              <button
                key={s}
                className={`rc-speed-btn ${speed === s ? 'active' : ''}`}
                onClick={() => onSpeedChange(s)}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Exit */}
          <button className="rc-exit-btn" onClick={onToggleActive} title="Exit Replay">✕</button>
        </div>
      )}
    </div>
  );
}
