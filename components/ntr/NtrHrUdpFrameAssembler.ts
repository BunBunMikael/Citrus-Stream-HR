import {Buffer} from 'buffer';

const RP_DATA_HEADER_SIZE = 4;
const RP_PACKET_DATA_SIZE = 1444;
const RP_MAX_PACKET_COUNT = 480;
const RP_DOWNSAMPLE_MASK = 0x0c;

export interface HrUdpFrame {
  frameId: number;
  isTop: boolean;
  fullWidth: boolean;
  bothEyes: boolean;
  downsample: number;
  evenOdd: boolean;
  isLossless: boolean;
  jpeg: Buffer;
}

interface ActiveFrame {
  frameId: number;
  screenFlags: number;
  formatFlags: number;
  packets: Map<number, Buffer>;
  maxPacket: number;
  endSeen: boolean;
}

/** Reassembles NTR-HR's non-KCP 4-byte-header UDP stream. */
export class NtrHrUdpFrameAssembler {
  private activeByScreen = new Map<number, ActiveFrame>();
  private lastFrameIdByScreen = new Map<number, number>();
  private completedFrameIdByScreen = new Map<number, number>();
  private droppedFrames = 0;
  private duplicatePackets = 0;

  reset() {
    this.activeByScreen.clear();
    this.lastFrameIdByScreen.clear();
    this.completedFrameIdByScreen.clear();
    this.droppedFrames = 0;
    this.duplicatePackets = 0;
  }

  takeDroppedFrames(): number {
    const count = this.droppedFrames;
    this.droppedFrames = 0;
    return count;
  }

  takeDuplicatePackets(): number {
    const count = this.duplicatePackets;
    this.duplicatePackets = 0;
    return count;
  }

  accept(datagram: Buffer): HrUdpFrame | null {
    if (datagram.length < RP_DATA_HEADER_SIZE) return null;
    const frameId = datagram.readUInt8(0);
    const rawScreenFlags = datagram.readUInt8(1);
    const isEnd = (rawScreenFlags & 0x10) !== 0;
    const screenFlags = rawScreenFlags & ~0x10;
    const formatFlags = datagram.readUInt8(2);
    const packetByte = datagram.readUInt8(3);
    const payload = datagram.subarray(RP_DATA_HEADER_SIZE);

    if ((formatFlags & ~(RP_DOWNSAMPLE_MASK | 0x01)) !== 0x02) return null;
    if (isEnd ? payload.length > RP_PACKET_DATA_SIZE : payload.length !== RP_PACKET_DATA_SIZE) return null;

    const screen = screenFlags === 0 ? 0 : 1; // matches upstream top_bot = !screenFlags
    const lastFrameId = this.lastFrameIdByScreen.get(screen);
    if (lastFrameId !== undefined && frameId !== lastFrameId) {
      const distance = (frameId - lastFrameId + 256) % 256;
      if (distance >= 128) return null; // late packet from a previous frame
      if (this.activeByScreen.has(screen)) this.droppedFrames += 1;
      this.activeByScreen.delete(screen);
      this.completedFrameIdByScreen.delete(screen);
    } else if (lastFrameId === frameId && this.completedFrameIdByScreen.get(screen) === frameId) {
      this.duplicatePackets += 1;
      return null; // duplicate packet after the completed frame
    }
    this.lastFrameIdByScreen.set(screen, frameId);

    let frame = this.activeByScreen.get(screen);
    if (!frame || frame.frameId !== frameId || frame.screenFlags !== screenFlags || frame.formatFlags !== formatFlags) {
      if (frame) this.droppedFrames += 1;
      frame = {frameId, screenFlags, formatFlags, packets: new Map(), maxPacket: -1, endSeen: false};
      this.activeByScreen.set(screen, frame);
    }

    let packetNumber = packetByte;
    if (packetNumber + 128 < frame.maxPacket) packetNumber += 256;
    if (packetNumber >= RP_MAX_PACKET_COUNT) return null;
    if (frame.packets.has(packetNumber)) {
      this.duplicatePackets += 1;
      return null;
    }

    frame.packets.set(packetNumber, Buffer.from(payload));
    if (packetNumber > frame.maxPacket) frame.maxPacket = packetNumber;
    if (isEnd) frame.endSeen = true;
    if (!frame.endSeen) return null;

    const terminalIndex = frame.maxPacket;
    for (let i = 0; i < terminalIndex; i += 1) {
      if (!frame.packets.has(i)) return null;
    }

    const ordered: Buffer[] = [];
    for (let i = 0; i <= terminalIndex; i += 1) {
      const part = frame.packets.get(i);
      if (!part) return null;
      ordered.push(part);
    }

    const isTop = screenFlags !== 0;
    const fullWidthFlag = (screenFlags & 2) !== 0;
    const bothEyesFlag = (screenFlags & 4) !== 0;
    const fullWidth = isTop && fullWidthFlag;
    const completed: HrUdpFrame = {
      frameId,
      isTop,
      fullWidth,
      bothEyes: fullWidth && bothEyesFlag,
      downsample: (formatFlags & RP_DOWNSAMPLE_MASK) >>> 2,
      evenOdd: (frameId & 1) !== 0,
      isLossless: (formatFlags & 1) !== 0,
      jpeg: Buffer.concat(ordered),
    };
    this.activeByScreen.delete(screen);
    this.completedFrameIdByScreen.set(screen, frameId);
    return completed;
  }
}
