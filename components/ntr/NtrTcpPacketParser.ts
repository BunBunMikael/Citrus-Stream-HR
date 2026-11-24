import {Buffer} from 'buffer';

export interface NtrTcpPacket {
  sequence: number;
  type: number;
  command: number;
  args: number[];
  payload: Buffer;
}

/** Parses the fixed NTR TCP header independent of TCP event boundaries. */
export class NtrTcpPacketParser {
  private static readonly HEADER_SIZE = 84;
  private static readonly MAX_PAYLOAD_SIZE = 16 * 1024 * 1024;
  private static readonly MAGIC = 0x12345678;
  private static readonly MAGIC_BYTES = Buffer.from([0x78, 0x56, 0x34, 0x12]);

  private rxBuffer: Buffer = Buffer.alloc(0);
  private pendingHeader: Omit<NtrTcpPacket, 'payload'> & {payloadLength: number} | null = null;

  reset() {
    this.rxBuffer = Buffer.alloc(0);
    this.pendingHeader = null;
  }

  push(chunk: Buffer): NtrTcpPacket[] {
    if (chunk.length) {
      this.rxBuffer = this.rxBuffer.length
        ? Buffer.concat([this.rxBuffer, chunk])
        : Buffer.from(chunk);
    }

    const packets: NtrTcpPacket[] = [];
    while (true) {
      if (this.pendingHeader) {
        const pending = this.pendingHeader;
        if (this.rxBuffer.length < pending.payloadLength) break;
        const payload = this.rxBuffer.subarray(0, pending.payloadLength);
        this.rxBuffer = this.rxBuffer.subarray(pending.payloadLength);
        packets.push({
          sequence: pending.sequence,
          type: pending.type,
          command: pending.command,
          args: pending.args,
          payload,
        });
        this.pendingHeader = null;
        continue;
      }

      if (this.rxBuffer.length < NtrTcpPacketParser.HEADER_SIZE) break;
      if (this.rxBuffer.readUInt32LE(0) !== NtrTcpPacketParser.MAGIC) {
        const nextMagic = this.rxBuffer.indexOf(NtrTcpPacketParser.MAGIC_BYTES, 1);
        if (nextMagic >= 0) {
          this.rxBuffer = this.rxBuffer.subarray(nextMagic);
        } else {
          // Retain a possible partial magic sequence across TCP events.
          this.rxBuffer = this.rxBuffer.subarray(Math.max(0, this.rxBuffer.length - 3));
          break;
        }
        continue;
      }

      const header = this.rxBuffer.subarray(0, NtrTcpPacketParser.HEADER_SIZE);
      this.rxBuffer = this.rxBuffer.subarray(NtrTcpPacketParser.HEADER_SIZE);
      const payloadLength = header.readUInt32LE(80);
      if (payloadLength > NtrTcpPacketParser.MAX_PAYLOAD_SIZE) {
        this.reset();
        throw new Error(`NTR TCP payload length is out of range: ${payloadLength}`);
      }

      const args: number[] = [];
      for (let i = 0; i < 16; i += 1) args.push(header.readUInt32LE(16 + i * 4));
      const parsedHeader = {
        sequence: header.readUInt32LE(4),
        type: header.readUInt32LE(8),
        command: header.readUInt32LE(12),
        args,
        payloadLength,
      };

      if (payloadLength === 0) {
        packets.push({...parsedHeader, payload: Buffer.alloc(0)});
      } else {
        this.pendingHeader = parsedHeader;
      }
    }

    return packets;
  }
}
