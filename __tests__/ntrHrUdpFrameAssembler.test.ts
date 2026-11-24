import {Buffer} from 'buffer';
import {NtrHrUdpFrameAssembler} from '../components/ntr/NtrHrUdpFrameAssembler';

function udpPacket(frameId: number, screenFlags: number, formatFlags: number, packet: number, payload: Buffer, end = false) {
  const header = Buffer.from([
    frameId & 0xff,
    (screenFlags | (end ? 0x10 : 0)) & 0xff,
    formatFlags & 0xff,
    packet & 0xff,
  ]);
  return Buffer.concat([header, payload]);
}

describe('NTR-HR plain UDP frame assembly', () => {
  it('reorders packets and preserves top full-width/both-eye flags', () => {
    const assembler = new NtrHrUdpFrameAssembler();
    const firstPayload = Buffer.alloc(1444, 0x11);
    firstPayload[0] = 0xff;
    firstPayload[1] = 0xd8;
    const finalPayload = Buffer.from([0x22, 0x33, 0xff, 0xd9]);
    expect(assembler.accept(udpPacket(254, 7, 2, 1, finalPayload, true))).toBeNull();
    const frame = assembler.accept(udpPacket(254, 7, 2, 0, firstPayload));
    expect(frame).not.toBeNull();
    expect(frame!.isTop).toBe(true);
    expect(frame!.fullWidth).toBe(true);
    expect(frame!.bothEyes).toBe(true);
    expect(frame!.jpeg).toHaveLength(1448);
    expect(frame!.jpeg.subarray(-4)).toEqual(finalPayload);
    expect(frame!.jpeg.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });

  it('recognizes bottom screen and drops duplicate packets after completion', () => {
    const assembler = new NtrHrUdpFrameAssembler();
    const payload = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const endPacket = udpPacket(8, 0, 2, 0, payload, true);
    const frame = assembler.accept(endPacket);
    expect(frame?.isTop).toBe(false);
    expect(frame?.fullWidth).toBe(false);
    expect(assembler.accept(endPacket)).toBeNull();
  });

  it('accepts frame-id wrap from 255 to 0', () => {
    const assembler = new NtrHrUdpFrameAssembler();
    const payload = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const f255 = assembler.accept(udpPacket(255, 1, 2, 0, payload, true));
    const f0 = assembler.accept(udpPacket(0, 1, 2, 0, payload, true));
    expect(f255?.frameId).toBe(255);
    expect(f0?.frameId).toBe(0);
  });
});
