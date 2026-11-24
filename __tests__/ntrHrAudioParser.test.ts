import {Buffer} from 'buffer';
import {parseHrKcpAudioPacket, parseHrPlainUdpAudioPacket, HR_AUDIO_FRAME_BYTES} from '../components/ntr/NtrHrAudioParser';

describe('NTR-HR DSP audio packet parsing', () => {
  it('parses plain UDP PCM16 stereo audio', () => {
    const packet = Buffer.alloc(4 + HR_AUDIO_FRAME_BYTES * 2);
    packet[0] = 7;
    packet[2] = 4;
    packet[3] = 0;
    const parsed = parseHrPlainUdpAudioPacket(packet);
    expect(parsed?.sequence).toBe(7);
    expect(parsed?.frameCount).toBe(2);
    expect(parsed?.pcm).toHaveLength(HR_AUDIO_FRAME_BYTES * 2);
  });

  it('drops the zero-filled penultimate frame in the upstream UDP workaround', () => {
    const packet = Buffer.alloc(4 + HR_AUDIO_FRAME_BYTES * 2);
    packet[0] = 12;
    packet[2] = 4;
    packet[3] = 0;
    packet.fill(0x7f, 4 + HR_AUDIO_FRAME_BYTES);
    const parsed = parseHrPlainUdpAudioPacket(packet);
    expect(parsed?.frameCount).toBe(1);
    expect(parsed?.pcm).toHaveLength(HR_AUDIO_FRAME_BYTES);
    expect(parsed?.pcm[0]).toBe(0x7f);
  });

  it('parses KCP-v2 in-band audio and reprime metadata', () => {
    const packet = Buffer.alloc(2 + 2 + 2 + HR_AUDIO_FRAME_BYTES * 2);
    packet.writeUInt16LE(3 << 14, 0); // KCP outer type = terminator/audio
    packet.writeUInt16LE(1 << 15, 2); // extended header present
    packet.writeUInt16LE((1 << 15) | (1 << 14) | (1 << 12) | (1 << 11), 4); // v2, audio, 1 frame, reprime
    const parsed = parseHrKcpAudioPacket(packet, true);
    expect(parsed?.frameCount).toBe(1);
    expect(parsed?.reprime).toBe(true);
    expect(parsed?.sequenceAdvance).toBe(127);
    expect(parsed?.pcm).toHaveLength(HR_AUDIO_FRAME_BYTES);
    expect(parseHrKcpAudioPacket(packet, false)).toBeNull();
  });
});
