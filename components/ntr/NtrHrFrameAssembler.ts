import {Buffer} from 'buffer';

export interface HrPacketHeader {
  pid: number;
  cid: number;
  workIndex: number;
  termIndex: number;
  payload: Buffer;
}

export interface HrFrameMetadata {
  jpegQuality: number;
  colorBias: number;
  isLossless: boolean;
  coreCount: number;
  isTop: boolean;
  chromaSampling: number;
  deltaProgressive: boolean;
  downsample: number;
  evenOdd: boolean;
  fullWidth: boolean;
  bothEyes: boolean;
  termV2: boolean;
  verticalRows: number[];
  termSizes: number[];
}

export interface HrCompletedFrame {
  workIndex: number;
  metadata: HrFrameMetadata;
  cores: Array<{dataPackets: Buffer[]; termData: Buffer}>;
}

const RP_KCP_PACKET_SIZE = 1444;
const RP_CORE_COUNT_MAX = 3;
const RP_COLOR_BIAS_MAX = 2;
const RP_MAX_PACKET_COUNT = 256;

export function parseHrPacketHeader(packet: Buffer): HrPacketHeader {
  if (packet.length < 2) throw new Error('HR KCP payload is shorter than its header');
  const header = packet.readUInt16LE(0);
  return {
    pid: header & 0x0fff,
    cid: (header >>> 12) & 1,
    workIndex: (header >>> 13) & 1,
    termIndex: (header >>> 14) & 3,
    payload: packet.subarray(2),
  };
}

export function parseHrFrameMetadata(data: Buffer): {metadata: HrFrameMetadata; bytesConsumed: number} {
  if (data.length < 2) throw new Error('HR terminator is missing its metadata word');
  let offset = 0;
  const header = data.readUInt16LE(offset);
  offset += 2;

  const rawQuality = header & 0x7f;
  const coreCount = (header >>> 7) & 0x03;
  const topBottom = (header >>> 9) & 1;
  const chromaSampling = (header >>> 10) & 0x03;
  const deltaProgressive = ((header >>> 12) & 1) !== 0;
  const downsample = (header >>> 13) & 0x03;
  const hasExtendedHeader = ((header >>> 15) & 1) !== 0;

  if (coreCount < 1 || coreCount > RP_CORE_COUNT_MAX) {
    throw new Error(`Unsupported HR core count: ${coreCount}`);
  }

  let evenOdd = false;
  let fullWidth = false;
  let bothEyes = false;
  let termV2 = false;
  if (hasExtendedHeader) {
    if (data.length < offset + 2) throw new Error('Truncated HR extended metadata');
    const extended = data.readUInt16LE(offset);
    offset += 2;
    evenOdd = (extended & 1) !== 0;
    fullWidth = ((extended >>> 1) & 1) !== 0;
    bothEyes = ((extended >>> 2) & 1) !== 0;
    termV2 = ((extended >>> 14) & 1) !== 0;
  }

  const isLossless = deltaProgressive
    ? (rawQuality & 0x40) !== 0
    : rawQuality <= RP_COLOR_BIAS_MAX;
  const qualityValue = deltaProgressive ? rawQuality & 0x1f : rawQuality;

  const verticalRows: number[] = [];
  const termSizes: number[] = [];
  for (let i = 0; i < coreCount; i += 1) {
    if (data.length < offset + 2) throw new Error('Truncated HR per-core terminator metadata');
    const term = data.readUInt16LE(offset);
    offset += 2;
    const termSize = term & 0x07ff;
    if (termSize > RP_KCP_PACKET_SIZE) throw new Error(`HR terminator size out of range: ${termSize}`);
    verticalRows.push((term >>> 11) & 0x1f);
    termSizes.push(termSize);
  }

  return {
    metadata: {
      jpegQuality: isLossless ? 0 : qualityValue,
      colorBias: isLossless ? qualityValue : 0,
      isLossless,
      coreCount,
      isTop: topBottom === 0,
      chromaSampling,
      deltaProgressive,
      downsample,
      evenOdd,
      fullWidth: topBottom === 0 && fullWidth,
      bothEyes: fullWidth && bothEyes,
      termV2,
      verticalRows,
      termSizes,
    },
    bytesConsumed: offset,
  };
}

interface WorkState {
  metadata: HrFrameMetadata | null;
  dataPackets: Buffer[][];
  termData: Buffer[];
  nextCore: number;
  termCount: number;
}

/**
 * Reassembles ordered KCP payloads into per-core HR compressed streams.
 * KCP/FEC transport and the JPEG/lossless decoders are separate layers.
 */
export class NtrHrFrameAssembler {
  private work = new Map<string, WorkState>();
  private queueIndex: [number, number] = [0, 0];
  private kcpV2 = false;

  reset() {
    this.work.clear();
    this.queueIndex = [0, 0];
    this.kcpV2 = false;
  }

  accept(kcpPayload: Buffer): HrCompletedFrame | null {
    const packet = parseHrPacketHeader(kcpPayload);
    const queueIndex = this.queueIndex[packet.workIndex];
    const workKey = `${packet.workIndex}:${queueIndex}`;
    let state = this.work.get(workKey);
    if (!state) {
      state = {metadata: null, dataPackets: [[], [], []], termData: [Buffer.alloc(0), Buffer.alloc(0), Buffer.alloc(0)], nextCore: 0, termCount: 0};
      this.work.set(workKey, state);
    }

    if (packet.termIndex < RP_CORE_COUNT_MAX) {
      if (state.metadata) throw new Error('HR core data arrived after the terminator for its frame');
      if (packet.payload.length !== RP_KCP_PACKET_SIZE) {
        throw new Error(`Invalid HR core packet size: ${packet.payload.length}`);
      }
      const packets = state.dataPackets[packet.termIndex];
      if (packets.length >= RP_MAX_PACKET_COUNT) throw new Error('HR core packet count exceeded limit');
      packets.push(Buffer.from(packet.payload));
      return null;
    }

    let offset = 0;
    if (state.termCount === 0) {
      const parsed = parseHrFrameMetadata(packet.payload);
      state.metadata = parsed.metadata;
      offset = parsed.bytesConsumed;
      if (this.kcpV2 && !parsed.metadata.termV2) throw new Error('HR KCP v2 terminator flag mismatch');
      if (parsed.metadata.termV2) this.kcpV2 = true;
    } else if (this.kcpV2) {
      if (packet.payload.length < 4) throw new Error('Truncated HR KCP v2 terminator');
      const extended = packet.payload.readUInt16LE(0);
      const version = packet.payload.readUInt16LE(2);
      if (((extended >>> 15) & 1) === 0 || ((version >>> 14) & 1) === 0) {
        throw new Error('Invalid HR KCP v2 terminator continuation');
      }
      offset = 4;
    }

    const metadata = state.metadata;
    if (!metadata) throw new Error('HR terminator state was not initialized');
    while (state.nextCore < metadata.coreCount && metadata.termSizes[state.nextCore] === 0) {
      state.nextCore += 1;
    }
    while (offset < packet.payload.length && state.nextCore < metadata.coreCount) {
      const core = state.nextCore;
      const expected = metadata.termSizes[core];
      const current = state.termData[core];
      const remaining = expected - current.length;
      if (remaining <= 0) {
        state.nextCore += 1;
        continue;
      }
      const take = Math.min(remaining, packet.payload.length - offset);
      state.termData[core] = Buffer.concat([current, packet.payload.subarray(offset, offset + take)]);
      offset += take;
      if (state.termData[core].length === expected) {
        state.nextCore += 1;
        while (state.nextCore < metadata.coreCount && metadata.termSizes[state.nextCore] === 0) {
          state.nextCore += 1;
        }
      }
    }
    state.termCount += 1;

    if (state.nextCore !== metadata.coreCount) return null;

    const completed: HrCompletedFrame = {
      workIndex: packet.workIndex,
      metadata,
      cores: Array.from({length: metadata.coreCount}, (_, i) => ({
        dataPackets: state!.dataPackets[i],
        termData: state!.termData[i],
      })),
    };
    this.work.delete(workKey);
    this.queueIndex[packet.workIndex] = (this.queueIndex[packet.workIndex] + 1) % 2;
    return completed;
  }
}
