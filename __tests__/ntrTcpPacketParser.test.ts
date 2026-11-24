import {Buffer} from 'buffer';
import {NtrTcpPacketParser} from '../components/ntr/NtrTcpPacketParser';

function packet(command: number, payload: Buffer = Buffer.alloc(0), sequence = 7) {
  const header = Buffer.alloc(84);
  header.writeUInt32LE(0x12345678, 0);
  header.writeUInt32LE(sequence, 4);
  header.writeUInt32LE(0, 8);
  header.writeUInt32LE(command, 12);
  header.writeUInt32LE(payload.length, 80);
  return Buffer.concat([header, payload]);
}

describe('NtrTcpPacketParser', () => {
  it('handles a header split across TCP data events', () => {
    const parser = new NtrTcpPacketParser();
    const bytes = packet(901);
    expect(parser.push(bytes.subarray(0, 29))).toHaveLength(0);
    const parsed = parser.push(bytes.subarray(29));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].command).toBe(901);
    expect(parsed[0].sequence).toBe(7);
  });

  it('handles coalesced packets and a fragmented payload', () => {
    const parser = new NtrTcpPacketParser();
    const body = Buffer.from([1, 2, 3, 4, 5]);
    const first = packet(0);
    const second = packet(17, body);
    const combined = Buffer.concat([first, second]);
    const parsedFirst = parser.push(combined.subarray(0, 84 + 84 + 2));
    expect(parsedFirst).toHaveLength(1);
    expect(parsedFirst[0].command).toBe(0);
    const parsedSecond = parser.push(combined.subarray(84 + 84 + 2));
    expect(parsedSecond).toHaveLength(1);
    expect(parsedSecond[0].command).toBe(17);
    expect(parsedSecond[0].payload).toEqual(body);
  });

  it('recovers from bytes before the next valid packet header', () => {
    const parser = new NtrTcpPacketParser();
    const valid = packet(901);
    const parsed = parser.push(Buffer.concat([Buffer.from([0xaa, 0xbb, 0xcc]), valid]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].command).toBe(901);
  });
});
