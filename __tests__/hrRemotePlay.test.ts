import {buildHrRemotePlayArgs, requiresHrRemotePlay, NTR_HR_REMOTE_PLAY_GUARD, NTR_HR_STREAM_PORT} from '../components/ntr/hrRemotePlay';

describe('buildHrRemotePlayArgs', () => {
  const base = {
    screenPriority: 1,
    priorityFactor: 5,
    jpegq: 95,
    hrEnabled: false,
    hrStreamFormat: 0,
    hrBandwidthLimit: 16,
    hrAutoQualityEnabled: false,
    jpegQualityAuto: 95,
    hrBandwidthAutoKbps: 16000,
    hrLosslessColor: 2,
    hrAudioEnabled: false,
    hrFullWidthMode: 0,
  };

  it('encodes classic-compatible HR RemotePlay defaults', () => {
    expect(buildHrRemotePlayArgs(base)).toEqual([
      0x105,
      95,
      16 * 128 * 1024,
      NTR_HR_REMOTE_PLAY_GUARD,
      NTR_HR_STREAM_PORT,
      0,
      0,
    ]);
  });

  it('keeps classic mode on the legacy request unless an HR-only option is enabled', () => {
    expect(requiresHrRemotePlay(base)).toBe(false);
    expect(requiresHrRemotePlay({...base, hrEnabled: true})).toBe(true);
    expect(requiresHrRemotePlay({...base, hrAudioEnabled: true})).toBe(true);
    expect(requiresHrRemotePlay({...base, hrFullWidthMode: 2})).toBe(true);
    expect(requiresHrRemotePlay({...base, hrBandwidthLimit: 20})).toBe(true);
    expect(requiresHrRemotePlay({...base, hrAutoQualityEnabled: true})).toBe(true);
  });

  it('applies adaptive quality and bandwidth ceilings to the RemotePlay request', () => {
    const args = buildHrRemotePlayArgs({...base, hrAutoQualityEnabled: true, jpegq: 95, jpegQualityAuto: 70, hrBandwidthLimit: 16, hrBandwidthAutoKbps: 12000});
    expect(args[1]).toBe(70);
    expect(args[2]).toBe(Math.round(12000 * 128 * 1024 / 1000));
  });

  it('sets RS and delta flags for JPEG RS Delta', () => {
    const args = buildHrRemotePlayArgs({...base, hrStreamFormat: 2});
    expect(args[4]).toBe((NTR_HR_STREAM_PORT | (1 << 30) | (1 << 31)) >>> 0);
  });

  it('encodes lossless color, audio, and both-eye capture', () => {
    const args = buildHrRemotePlayArgs({
      ...base,
      hrStreamFormat: 5,
      hrLosslessColor: 2,
      hrAudioEnabled: true,
      hrFullWidthMode: 2,
    });
    expect(args[4]).toBe((NTR_HR_STREAM_PORT | (1 << 30) | (1 << 31) | (1 << 29)) >>> 0);
    expect(args[5]).toBe(2);
    expect(args[6]).toBe(2);
  });
});
