import React, { Component } from 'react';
import { NativeModules, Platform, View } from 'react-native';
import dgram from 'react-native-udp';
import { Buffer } from 'buffer';
import { EventRegister } from 'react-native-event-listeners';
import { HrAudioPacket, parseHrPlainUdpAudioPacket } from '../ntr/NtrHrAudioParser';
import { HrRemotePlaySettings, requiresHrRemotePlay } from '../ntr/hrRemotePlay';
import { NtrHrUdpFrameAssembler } from '../ntr/NtrHrUdpFrameAssembler';
import { HrAutoQualityController } from '../ntr/HrAutoQualityController';

const { StreamWorkerModule } = NativeModules;

interface StreamWorkerProps {
  dsIP: string;
}

interface StreamWorkerState {
  connected: boolean;
  fps: number;
}

interface ProcessPacketsResult {
  jpeg: string;
  isTop: boolean;
}

class StreamWorker extends Component<StreamWorkerProps, StreamWorkerState> {
  private socket: any;
  private abort: boolean = false;
  private streamReadyListener: any;
  private stopStreamListener: any;
  private framePackets: Map<string, Map<number, Buffer>> = new Map();
  private frameEndPacket: Map<string, number> = new Map();
  private lastFrameIdForScreen: Map<number, number> = new Map();
  private lastCompletedFrameIdForScreen: Map<number, number> = new Map();
  private frameCount: number = 0;
  private packetsThisSecond: number = 0;
  private bytesThisSecond: number = 0;
  private framesLostThisSecond: number = 0;
  private duplicatePacketsThisSecond: number = 0;
  private framesReceivedTotal: number = 0;
  private framesLostTotal: number = 0;
  private audioExpectedSequence: number | null = null;
  private audioPackets: Map<number, HrAudioPacket> = new Map();
  private hrUdpAssembler = new NtrHrUdpFrameAssembler();
  private hrUdpMode: boolean = false;
  private hrKcpMode: boolean = false;
  private hrAudioEnabled: boolean = false;
  private hrAutoQualityActive: boolean = false;
  private hrJpegQualityCeiling: number = 60;
  private hrBandwidthCeilingMbps: number = 16;
  private hrVideoBytesThisSecond: number = 0;
  private hrStreamGeneration: number = 0;
  private hrAutoQualityController = new HrAutoQualityController();
  private lastHrAutoState = {jpegQualityAuto: 60, bandwidthAutoKbps: 16000};
  private streamSettingsListener: any;
  private fpsInterval: NodeJS.Timeout | null = null;

  constructor(props: StreamWorkerProps) {
    super(props);

    this.state = {
      connected: false,
      fps: 0,
    };

    this.streamReadyListener = EventRegister.addEventListener('stream', this.startStream);
    this.stopStreamListener = EventRegister.addEventListener('stopStream', this.stopStream);
    this.streamSettingsListener = EventRegister.addEventListener('streamSettings', this.updateHrStreamMode);
  }

  componentWillUnmount() {
    EventRegister.removeEventListener(this.streamReadyListener);
    EventRegister.removeEventListener(this.stopStreamListener);
    if (this.fpsInterval) {
      clearInterval(this.fpsInterval);
    }
    this.stopStream(); // Ensure the stream is stopped when the component unmounts
    EventRegister.removeEventListener(this.streamSettingsListener);
  }

  startStream = () => {
    console.log('StreamWorker: startStream called');
    this.abort = false;
    this.hrStreamGeneration += 1;
    this.hrUdpAssembler.reset();
    this.resetHrFrameProcessor();
    this.resetAudioQueue();
    if (!this.state.connected) {
      this.socket = dgram.createSocket({ type: 'udp4' });
      this.socket.on('message', this.handleMessage);
      this.socket.bind(8001, () => {
        this.setState({ connected: true });
        EventRegister.emit('stateChanged', 'Connected');
        console.log('Socket bound and listening on port 8001');
      });

      this.socket.on('error', (err: Error) => {
        console.error('Socket error:', err);
        this.stopStream();
      });

      this.startFPSCounter();
    }
  };

  stopStream = () => {
    console.log('StreamWorker: stopStream called');
    this.abort = true;
    this.hrStreamGeneration += 1;
    this.framePackets.clear();
    this.frameEndPacket.clear();
    this.lastFrameIdForScreen.clear();
    this.lastCompletedFrameIdForScreen.clear();
    this.hrUdpAssembler.reset();
    this.resetHrFrameProcessor();
    this.hrUdpMode = false;
    this.hrKcpMode = false;
    this.hrAudioEnabled = false;
    this.hrAutoQualityActive = false;
    this.hrVideoBytesThisSecond = 0;
    this.resetAudioQueue();
    if (Platform.OS === 'android' && StreamWorkerModule?.stopHrAudio) {
      StreamWorkerModule.stopHrAudio();
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.setState({ connected: false });
      EventRegister.emit('stateChanged', 'Disconnected');
      console.log('Socket closed and stream stopped');
    }
    if (this.fpsInterval) {
      clearInterval(this.fpsInterval);
      this.fpsInterval = null;
    }
  };

  startFPSCounter = () => {
    this.frameCount = 0;
    this.packetsThisSecond = 0;
    this.bytesThisSecond = 0;
    this.framesLostThisSecond = 0;
    this.duplicatePacketsThisSecond = 0;
    this.hrVideoBytesThisSecond = 0;
    this.framesReceivedTotal = 0;
    this.framesLostTotal = 0;
    this.setState({ fps: 0 });

    this.fpsInterval = setInterval(() => {
      this.setState({ fps: this.frameCount });
      const frameTotal = this.frameCount + this.framesLostThisSecond;
      const packetHealth = frameTotal > 0 ? (this.frameCount / frameTotal) * 100 : 0;
      const traffic = frameTotal > 0;
      if (this.hrAutoQualityActive) {
        const saturation = traffic && packetHealth > 0
          ? this.hrVideoBytesThisSecond / (packetHealth / 100) / (this.hrBandwidthCeilingMbps * 128 * 1024)
          : traffic ? 1 : 0;
        const autoState = this.hrAutoQualityController.tick({traffic, packetHealth, saturation});
        if (autoState.jpegQualityAuto !== this.lastHrAutoState.jpegQualityAuto || autoState.bandwidthAutoKbps !== this.lastHrAutoState.bandwidthAutoKbps) {
          this.lastHrAutoState = autoState;
          EventRegister.emit('hrAutoSettings', {
            jpegQualityAuto: autoState.jpegQualityAuto,
            hrBandwidthAutoKbps: autoState.bandwidthAutoKbps,
          });
        }
      }
      EventRegister.emit('streamStats', {
        fps: this.frameCount,
        packetsPerSecond: this.packetsThisSecond,
        kilobitsPerSecond: (this.bytesThisSecond * 8) / 1000,
        frameLossRate: frameTotal > 0 ? (this.framesLostThisSecond / frameTotal) * 100 : 0,
        duplicatePackets: this.duplicatePacketsThisSecond,
        framesReceivedTotal: this.framesReceivedTotal,
        framesLostTotal: this.framesLostTotal,
        autoQuality: this.hrAutoQualityActive ? this.lastHrAutoState.jpegQualityAuto : 0,
        autoBandwidthMbps: this.hrAutoQualityActive ? this.lastHrAutoState.bandwidthAutoKbps / 1000 : 0,
      });
      this.frameCount = 0;
      this.packetsThisSecond = 0;
      this.bytesThisSecond = 0;
      this.framesLostThisSecond = 0;
      this.duplicatePacketsThisSecond = 0;
      this.hrVideoBytesThisSecond = 0;
    }, 1000);
  };

  updateHrStreamMode = (settings: HrRemotePlaySettings) => {
    this.hrStreamGeneration += 1;
    const format = Math.max(0, Math.min(5, settings.hrStreamFormat || 0));
    const useHrControl = requiresHrRemotePlay(settings);
    this.hrKcpMode = useHrControl && [1, 2, 4, 5].includes(format);
    this.hrAudioEnabled = !!settings.hrAudioEnabled && !this.hrKcpMode;
    this.hrJpegQualityCeiling = Math.max(10, Math.min(100, settings.jpegq));
    this.hrBandwidthCeilingMbps = Math.max(4, Math.min(20, settings.hrBandwidthLimit));
    this.hrUdpMode = useHrControl && !this.hrKcpMode;
    this.hrAutoQualityActive = !!settings.hrAutoQualityEnabled && this.hrUdpMode && format === 0;
    this.hrAutoQualityController.reset(this.hrJpegQualityCeiling, this.hrBandwidthCeilingMbps);
    this.lastHrAutoState = this.hrAutoQualityController.getState();
    this.hrVideoBytesThisSecond = 0;
    this.hrUdpAssembler.reset();
    this.resetHrFrameProcessor();
    if (Platform.OS === 'android' && (this.hrKcpMode || !settings.hrAudioEnabled) && StreamWorkerModule?.stopHrAudio) {
      this.resetAudioQueue();
      StreamWorkerModule.stopHrAudio();
    }
  };

  resetHrFrameProcessor = () => {
    if (Platform.OS === 'android' && StreamWorkerModule?.resetHrFrameProcessor) {
      StreamWorkerModule.resetHrFrameProcessor();
    }
  };

  handleHrUdpDatagram = async (datagram: Buffer) => {
    const generation = this.hrStreamGeneration;
    try {
      const frame = this.hrUdpAssembler.accept(datagram);
      const droppedFrames = this.hrUdpAssembler.takeDroppedFrames();
      const duplicatePackets = this.hrUdpAssembler.takeDuplicatePackets();
      this.duplicatePacketsThisSecond += duplicatePackets;
      if (droppedFrames > 0) {
        this.framesLostThisSecond += droppedFrames;
        this.framesLostTotal += droppedFrames;
      }
      if (!frame) return;
      if (frame.isLossless) {
        // The HR lossless/Huffman decoder is a separate pending port.
        this.framesLostThisSecond += 1;
        this.framesLostTotal += 1;
        return;
      }
      if (frame.jpeg.length < 4 || frame.jpeg[0] !== 0xff || frame.jpeg[1] !== 0xd8 || frame.jpeg[frame.jpeg.length - 2] !== 0xff || frame.jpeg[frame.jpeg.length - 1] !== 0xd9) {
        this.framesLostThisSecond += 1;
        this.framesLostTotal += 1;
        return;
      }
      let jpegBase64 = frame.jpeg.toString('base64');
      if (frame.downsample === 2 && Platform.OS === 'android' && StreamWorkerModule?.processHrJpegFrame) {
        jpegBase64 = await StreamWorkerModule.processHrJpegFrame(jpegBase64, frame.isTop, frame.evenOdd);
      }
      if (this.abort || generation !== this.hrStreamGeneration) return;
      const uri = `data:image/jpeg;base64,${jpegBase64}`;
      EventRegister.emit('frameReady', {uri, isTop: frame.isTop, fullWidth: frame.fullWidth, bothEyes: frame.bothEyes, downsample: frame.downsample, evenOdd: frame.evenOdd});
      this.frameCount += 1;
      this.framesReceivedTotal += 1;
      this.hrVideoBytesThisSecond += frame.jpeg.length;
    } catch (error) {
      this.framesLostThisSecond += 1;
      this.framesLostTotal += 1;
      console.warn('NTR-HR UDP frame assembly error:', error);
      this.hrUdpAssembler.reset();
    }
  };

  handleMessage = (msg: Buffer) => {
    this.packetsThisSecond += 1;
    this.bytesThisSecond += msg.length;
    if (!this.hrKcpMode && msg.length >= 4 && msg.readUInt8(2) === 4) {
      if (this.hrAudioEnabled) {
        const audioPacket = parseHrPlainUdpAudioPacket(msg);
        if (audioPacket) this.enqueueHrAudio(audioPacket);
      }
      return;
    }
    if (this.hrKcpMode) {
      EventRegister.emit('hrKcpDatagram', Buffer.from(msg));
      return;
    }
    if (this.hrUdpMode) {
      this.handleHrUdpDatagram(msg);
      return;
    }
    if (msg.length < 4) return;
    const header = this.readPacketHeader(msg);
    const frameId = header[0];
    const screenId = header[1] & 0x0F;
    const packetNumber = header[2];
    const isEndOfFrame = (header[1] & 0xF0) === 0x10;
    const key = `${screenId}-${frameId}`;

    if (screenId !== 0 && screenId !== 1) return;

    const lastFrameId = this.lastFrameIdForScreen.get(screenId);
    if (lastFrameId === frameId && this.lastCompletedFrameIdForScreen.get(screenId) === frameId) {
      this.duplicatePacketsThisSecond += 1;
      return;
    }
    if (lastFrameId !== undefined && frameId !== lastFrameId) {
      // Frame IDs are 8-bit counters. Use modular ordering so a late packet
      // from the previous frame cannot evict a newer frame after reordering.
      const distance = (frameId - lastFrameId + 256) % 256;
      if (distance === 0 || distance >= 128) return;

      const oldKey = `${screenId}-${lastFrameId}`;
      this.lastCompletedFrameIdForScreen.delete(screenId);
      if (this.framePackets.has(oldKey)) {
        this.framesLostThisSecond += 1;
        this.framesLostTotal += 1;
      }
      this.framePackets.delete(oldKey);
      this.frameEndPacket.delete(oldKey);
    }
    this.lastFrameIdForScreen.set(screenId, frameId);

    if (!this.framePackets.has(key)) {
      this.framePackets.set(key, new Map<number, Buffer>());
    }

    const packets = this.framePackets.get(key)!;
    // Retransmitted/duplicated UDP datagrams must not inflate the packet count.
    if (!packets.has(packetNumber)) {
      packets.set(packetNumber, Buffer.from(msg));
    } else {
      this.duplicatePacketsThisSecond += 1;
    }

    if (isEndOfFrame) {
      this.frameEndPacket.set(key, packetNumber);
    }

    const endPacket = this.frameEndPacket.get(key);
    if (endPacket !== undefined) {
      // A frame is complete only when every packet index from 0 through the
      // terminal packet has arrived. Keep the original datagrams intact.
      for (let index = 0; index <= endPacket; index += 1) {
        if (!packets.has(index)) return;
      }

      const orderedPackets = Array.from({length: endPacket + 1}, (_, index) => packets.get(index)!);
      this.lastCompletedFrameIdForScreen.set(screenId, frameId);
      this.processFrame(orderedPackets);
      this.framePackets.delete(key);
      this.frameEndPacket.delete(key);
    }
  };

  resetAudioQueue = () => {
    this.audioExpectedSequence = null;
    this.audioPackets.clear();
  };

  enqueueHrAudio = (packet: HrAudioPacket) => {
    if (Platform.OS !== 'android' || !StreamWorkerModule?.playHrAudio) return;
    // Plain-UDP seq identifies the newest frame in the packet; the PCM frames
    // themselves are oldest-first. Convert it to the first frame's sequence.
    const newestSequence = packet.sequence ?? 0;
    const sequence = (newestSequence - (packet.frameCount - 1) + 256) & 0xff;
    if (this.audioExpectedSequence === null) this.audioExpectedSequence = sequence;
    const distance = (sequence - this.audioExpectedSequence + 256) % 256;
    if (distance >= 128 || this.audioPackets.has(sequence)) return;
    this.audioPackets.set(sequence, packet);
    this.flushHrAudioQueue();
  };

  flushHrAudioQueue = () => {
    if (this.audioExpectedSequence === null) return;
    // Buffer a few packets to absorb ordinary UDP reordering. If a packet is
    // missing for too long, skip to the nearest future sequence to avoid a
    // permanent audio stall.
    if (this.audioPackets.size > 4 && !this.audioPackets.has(this.audioExpectedSequence)) {
      let nearestSequence: number | null = null;
      let nearestDistance = 257;
      for (const sequence of this.audioPackets.keys()) {
        const distance = (sequence - this.audioExpectedSequence + 256) % 256;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestSequence = sequence;
        }
      }
      if (nearestSequence !== null) this.audioExpectedSequence = nearestSequence;
    }

    while (this.audioPackets.has(this.audioExpectedSequence)) {
      const sequence = this.audioExpectedSequence;
      const packet = this.audioPackets.get(sequence)!;
      this.audioPackets.delete(sequence);
      StreamWorkerModule.playHrAudio(packet.pcm.toString('base64'));
      this.audioExpectedSequence = (sequence + packet.frameCount) & 0xff;
    }
  };

  processFrame = async (packets: Array<Buffer>) => {
    try {
      // Pass individual datagrams across the bridge. The native receiver needs
      // their boundaries; concatenating and re-splitting at 1448 bytes is not
      // safe for variable-sized terminal packets.
      const result = await this.processPacketsWithNativeModule(packets);
      const { jpeg, isTop } = result;
      const uri = `data:image/jpeg;base64,${jpeg}`;
      EventRegister.emit('frameReady', { uri, isTop });
      this.frameCount += 1;
      this.framesReceivedTotal += 1;
    } catch (error) {
      this.framesLostThisSecond += 1;
      this.framesLostTotal += 1;
      console.error('Error processing packets:', error);
    }
  };

  processPacketsWithNativeModule = (packets: Buffer[]): Promise<ProcessPacketsResult> => {
    return new Promise((resolve, reject) => {
      const base64Packets = packets.map(packet => packet.toString('base64'));
      StreamWorkerModule.processPackets(base64Packets)
        .then((result: ProcessPacketsResult) => resolve(result))
        .catch((error: any) => reject(error));
    });
  };

  readPacketHeader = (packet: Buffer): [number, number, number] => {
    if (packet.length < 4) throw new Error('Invalid packet');
    const frameId = packet.readUInt8(0);
    const screenInfo = packet.readUInt8(1);
    const packetNumber = packet.readUInt8(3);
    return [frameId, screenInfo, packetNumber];
  };

  render() {
    return null;
  }
}

export default StreamWorker;
