import {Buffer} from 'buffer';
import {parseHrPacketHeader} from './NtrHrFrameAssembler';

export const HR_AUDIO_SAMPLE_RATE = 32728;
export const HR_AUDIO_FRAME_BYTES = 640; // 160 stereo PCM16 samples
export const HR_AUDIO_HEADER_TYPE = 4;

export interface HrAudioPacket {
  sequence?: number;
  sequenceAdvance?: number;
  frameCount: number;
  reprime: boolean;
  pcm: Buffer;
}

/** Parses the four-byte plain-UDP audio header; its sequence byte is the newest PCM frame in the packet. */
export function parseHrPlainUdpAudioPacket(datagram: Buffer): HrAudioPacket | null {
  if (datagram.length <= 4 || datagram.readUInt8(2) !== HR_AUDIO_HEADER_TYPE || datagram.readUInt8(3) !== 0) return null;
  let pcm = datagram.subarray(4);
  if (pcm.length === 0 || pcm.length % HR_AUDIO_FRAME_BYTES !== 0) return null;
  let frameCount = pcm.length / HR_AUDIO_FRAME_BYTES;
  // Match the upstream plain-UDP workaround for a zero-filled penultimate
  // frame that some firmware packets include before the newest audio frame.
  if (frameCount > 1) {
    const previousStart = (frameCount - 2) * HR_AUDIO_FRAME_BYTES;
    const previousFrame = pcm.subarray(previousStart, previousStart + HR_AUDIO_FRAME_BYTES);
    let previousFrameEmpty = true;
    for (let i = 0; i < previousFrame.length; i += 1) {
      if (previousFrame[i] !== 0) { previousFrameEmpty = false; break; }
    }
    if (previousFrameEmpty) {
      pcm = pcm.subarray((frameCount - 1) * HR_AUDIO_FRAME_BYTES);
      frameCount = 1;
    }
  }
  return {
    sequence: datagram.readUInt8(0),
    frameCount,
    reprime: false,
    pcm,
  };
}

/** Parses NTR-HR's KCP-v2 in-band DSP audio envelope. */
export function parseHrKcpAudioPacket(kcpPayload: Buffer, kcpV2: boolean): HrAudioPacket | null {
  if (!kcpV2) return null;
  const packet = parseHrPacketHeader(kcpPayload);
  if (packet.termIndex < 3 || packet.payload.length < 4) return null;

  const extendedHeader = packet.payload.readUInt16LE(0);
  if (((extendedHeader >>> 15) & 1) === 0) return null;
  const audioHeader = packet.payload.readUInt16LE(2);
  if (((audioHeader >>> 14) & 1) === 0 || ((audioHeader >>> 15) & 1) === 0) return null;

  const reprime = ((audioHeader >>> 11) & 1) !== 0;
  let frameCount = (audioHeader >>> 12) & 0x03;
  const pcm = packet.payload.subarray(4);
  if (frameCount === 0) frameCount = Math.floor(pcm.length / HR_AUDIO_FRAME_BYTES);
  if (frameCount < 1 || frameCount > 3 || pcm.length < frameCount * HR_AUDIO_FRAME_BYTES) return null;

  return {
    sequenceAdvance: reprime ? 127 : frameCount,
    frameCount,
    reprime,
    pcm: pcm.subarray(0, frameCount * HR_AUDIO_FRAME_BYTES),
  };
}
