/**
 * NTR-HR RemotePlay argument encoder.
 *
 * The argument layout follows xzn/ntrviewer-hr's ntr_hb.c RemotePlay request:
 * [priority, JPEG quality, QoS bytes/s, guard, port+mode flags, audio, eye mode].
 */
export interface HrRemotePlaySettings {
  screenPriority: number;
  priorityFactor: number;
  jpegq: number;
  hrEnabled: boolean;
  hrStreamFormat: number;
  hrBandwidthLimit: number;
  hrAutoQualityEnabled: boolean;
  jpegQualityAuto: number;
  hrBandwidthAutoKbps: number;
  hrLosslessColor: number;
  hrAudioEnabled: boolean;
  hrFullWidthMode: number;
}

export const NTR_HR_REMOTE_PLAY_GUARD = 1404036572;
export const NTR_HR_STREAM_PORT = 8001;

export function requiresHrRemotePlay(settings: HrRemotePlaySettings): boolean {
  return settings.hrEnabled || settings.hrStreamFormat > 0 || settings.hrAudioEnabled || settings.hrFullWidthMode > 0 || settings.hrBandwidthLimit !== 16 || settings.hrAutoQualityEnabled;
}

export function buildHrRemotePlayArgs(settings: HrRemotePlaySettings): number[] {
  const format = Math.max(0, Math.min(5, Math.trunc(settings.hrStreamFormat)));
  const kcpMode = format % 3;
  const losslessMode = format >= 3;
  const losslessColor = Math.max(0, Math.min(2, Math.trunc(settings.hrLosslessColor)));
  const colorBias = 2 - losslessColor;
  const bandwidthCeilingKbps = Math.max(4000, Math.min(20000, Math.round(settings.hrBandwidthLimit * 1000)));
  const bandwidthKbps = settings.hrAutoQualityEnabled
    ? Math.min(bandwidthCeilingKbps, Math.max(4000, Math.min(20000, Math.round(settings.hrBandwidthAutoKbps))))
    : bandwidthCeilingKbps;
  const jpegQualityCeiling = Math.max(10, Math.min(100, Math.round(settings.jpegq)));
  const jpegQuality = settings.hrAutoQualityEnabled
    ? Math.min(jpegQualityCeiling, Math.max(10, Math.min(100, Math.round(settings.jpegQualityAuto))))
    : jpegQualityCeiling;
  const fullWidthMode = Math.max(0, Math.min(2, Math.trunc(settings.hrFullWidthMode)));

  const portAndFlags = (
    NTR_HR_STREAM_PORT |
    (kcpMode !== 0 ? (1 << 30) : 0) |
    (kcpMode === 2 ? (1 << 31) : 0) |
    (losslessMode ? (1 << 29) | ((colorBias & 0x3) << 27) : 0)
  ) >>> 0;

  return [
    (((settings.screenPriority & 1) << 8) | (settings.priorityFactor & 0xff)) >>> 0,
    jpegQuality >>> 0,
    Math.round(bandwidthKbps * 128 * 1024 / 1000) >>> 0,
    NTR_HR_REMOTE_PLAY_GUARD,
    portAndFlags,
    settings.hrAudioEnabled ? 2 : 0,
    fullWidthMode,
  ];
}
