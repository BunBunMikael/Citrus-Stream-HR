import {Buffer} from 'buffer';
import {NtrHrFrameAssembler, parseHrFrameMetadata, parseHrPacketHeader} from '../components/ntr/NtrHrFrameAssembler';

function outerHeader(workIndex: number, termIndex: number) {
  return ((workIndex & 1) << 13) | ((termIndex & 3) << 14);
}

describe('NTR-HR KCP frame metadata', () => {
  it('decodes the KCP payload header bitfields', () => {
    const raw = Buffer.alloc(6);
    raw.writeUInt16LE(0x123 | (1 << 12) | (1 << 13) | (3 << 14), 0);
    raw.set([9, 8, 7, 6], 2);
    const parsed = parseHrPacketHeader(raw);
    expect(parsed).toMatchObject({pid: 0x123, cid: 1, workIndex: 1, termIndex: 3});
    expect(parsed.payload).toEqual(Buffer.from([9, 8, 7, 6]));
  });

  it('decodes JPEG quality, eye mode, and per-core terminator sizes', () => {
    const words = Buffer.alloc(6);
    const metadata = 90 | (1 << 7) | (1 << 10) | (1 << 15);
    words.writeUInt16LE(metadata, 0);
    words.writeUInt16LE(0x06, 2); // full-width + both eyes
    words.writeUInt16LE(3, 4); // 3-byte terminal segment
    const parsed = parseHrFrameMetadata(words);
    expect(parsed.bytesConsumed).toBe(6);
    expect(parsed.metadata).toMatchObject({
      jpegQuality: 90,
      isLossless: false,
      coreCount: 1,
      isTop: true,
      chromaSampling: 1,
      fullWidth: true,
      bothEyes: true,
      termSizes: [3],
    });
  });

  it('assembles core data and terminal bytes into a completed frame', () => {
    const assembler = new NtrHrFrameAssembler();
    const corePacket = Buffer.alloc(1446);
    corePacket.writeUInt16LE(outerHeader(0, 0), 0);
    corePacket.fill(0x5a, 2);
    expect(assembler.accept(corePacket)).toBeNull();

    const termPayload = Buffer.alloc(2 + 2 + 2 + 2 + 3);
    termPayload.writeUInt16LE(outerHeader(0, 3), 0);
    termPayload.writeUInt16LE(90 | (1 << 7) | (1 << 10) | (1 << 15), 2);
    termPayload.writeUInt16LE(0, 4); // no extended flags
    termPayload.writeUInt16LE(3, 6); // term size = 3
    termPayload.set([0xaa, 0xbb, 0xcc], 8);

    const frame = assembler.accept(termPayload);
    expect(frame).not.toBeNull();
    expect(frame!.metadata.jpegQuality).toBe(90);
    expect(frame!.cores[0].dataPackets).toHaveLength(1);
    expect(frame!.cores[0].termData).toEqual(Buffer.from([0xaa, 0xbb, 0xcc]));
  });
  it('reassembles a split KCP-v2 terminator and rotates the per-work queue', () => {
    const assembler = new NtrHrFrameAssembler();
    const core = Buffer.alloc(1446);
    core.writeUInt16LE(0, 0);
    core.fill(0x33, 2);
    assembler.accept(core);

    const firstTerm = Buffer.alloc(9);
    firstTerm.writeUInt16LE(3 << 14, 0);
    firstTerm.writeUInt16LE(90 | (1 << 7) | (1 << 15), 2);
    firstTerm.writeUInt16LE(1 << 14, 4); // KCP v2 terminator mode
    firstTerm.writeUInt16LE(3, 6);
    firstTerm[8] = 0xaa;
    expect(assembler.accept(firstTerm)).toBeNull();

    const continuation = Buffer.alloc(8);
    continuation.writeUInt16LE(3 << 14, 0);
    continuation.writeUInt16LE(1 << 15, 2); // extended header present
    continuation.writeUInt16LE(1 << 14, 4); // term v2
    continuation.set([0xbb, 0xcc], 6);
    const frame = assembler.accept(continuation);
    expect(frame?.cores[0].termData).toEqual(Buffer.from([0xaa, 0xbb, 0xcc]));

    // A following frame on the same work index uses the next receiver queue.
    const nextCore = Buffer.alloc(1446);
    nextCore.writeUInt16LE(0, 0);
    nextCore.fill(0x44, 2);
    expect(assembler.accept(nextCore)).toBeNull();
  });

});
