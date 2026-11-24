import React, { Component } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import TcpSocket from 'react-native-tcp-socket';
import { Buffer } from 'buffer';
import { EventRegister } from 'react-native-event-listeners';
import { buildHrRemotePlayArgs, requiresHrRemotePlay } from './hrRemotePlay';
import { NtrTcpPacketParser } from './NtrTcpPacketParser';

interface NtrProps {
  dsIP: string;
  screenPriority: number;
  priFact: number;
  jpegq: number;
  qosvalue: number;
}

interface NtrState {
  connected: boolean;
}

enum Command {
  Empty,
  WriteSave,
  Hello,
  Reload,
  PidList,
  AttachProc,
  ThreadList,
  MemLayout,
  ReadMem,
  WriteMem,
  Resume,
  QueryHandle,
  RemotePlay = 901,
}

class Ntr extends Component<NtrProps, NtrState> {
  private sock: any;
  private sequence: number = 0;
  private tcpParser = new NtrTcpPacketParser();
  private lastReplyTime: number = 0;
  private heartbeat: any;
  private remotePlayCalled: boolean = false;
  private hrRemotePlayActive: boolean = false;
  private hrResumePending: boolean = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelayMs: number = 1000;
  private ntrCommandListener: any;
  private ntrConnectListener: any;
  private appStateSubscription: { remove: () => void } | null = null;
  private streamSettingsListener: any;
  private hrAutoSettingsListener: any;
  private streamSettings: {
    screenPriority: number; priorityFactor: number; jpegq: number; qosvalue: number;
    hrEnabled: boolean; hrStreamFormat: number; hrBandwidthLimit: number; hrLosslessColor: number;
    hrAudioEnabled: boolean; hrAutoQualityEnabled: boolean; jpegQualityAuto: number; hrBandwidthAutoKbps: number; hrFullWidthMode: number;
  } | null = null;

  constructor(props: NtrProps) {
    super(props);

    this.state = {
      connected: false,
    };

    this.sequence = 0;
    this.tcpParser.reset();

    this.ntrCommandListener = EventRegister.addEventListener('ntrCommand', this.sendCommand);
    this.ntrConnectListener = EventRegister.addEventListener('ntrConnectToDs', this.connectToDS);
    this.streamSettingsListener = EventRegister.addEventListener('streamSettings', this.applyStreamSettings);
    this.hrAutoSettingsListener = EventRegister.addEventListener('hrAutoSettings', this.applyHrAutoSettings);
  }

  componentDidMount() {
    // Listen to app state changes
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  componentWillUnmount() {
    this.disconnectFromDS();
    EventRegister.removeEventListener(this.ntrCommandListener);
    EventRegister.removeEventListener(this.ntrConnectListener);
    EventRegister.removeEventListener(this.streamSettingsListener);
    EventRegister.removeEventListener(this.hrAutoSettingsListener);
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
    }
  }

  // Pause/resume Ntr connection based on app state
  handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState.match(/inactive|background/)) {
      console.log("Ntr: App is in background. Disconnecting.");
      this.disconnectFromDS();
    } else if (nextAppState === "active") {
      console.log("Ntr: App is active. Connecting.");
      this.connectToDS();
    }
  };

  startHeartbeat() {
    this.stopHeartbeat();
    const hrSession = this.hrRemotePlayActive;
    // NTR-HR uses a 250 ms heartbeat; keep the legacy client's 1 s cadence.
    this.heartbeat = setInterval(() => {
      if (!this.sock) return;
      if (hrSession && Date.now() - this.lastReplyTime > 1500) {
        console.warn('Ntr: HR heartbeat response timed out');
        this.sock.destroy();
        return;
      }
      this.sendHeartbeat();
    }, hrSession ? 250 : 1000);
  }

  stopHeartbeat() {
    clearInterval(this.heartbeat);
  }

  sendHeartbeat = () => {
    this.sendPacket(0, Command.Empty, [], 0);
  }

  connectToDS = () => {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.state.connected) {
      const resumeHr = this.hrRemotePlayActive;
      this.disconnectFromDS();
      this.hrResumePending = resumeHr;
    }

    this.sock = TcpSocket.createConnection(
      { port: 8000, host: this.props.dsIP },
      () => {
        console.log('Ntr: Connection attempted');
      }
    );

    this.sock.on('connect', () => {
      console.log('Ntr: Connection established');
      this.setState({ connected: true }, () => {
        this.lastReplyTime = Date.now();
        this.reconnectDelayMs = 1000;
        this.sendHeartbeat();
        this.startHeartbeat();
        if (this.hrResumePending && this.streamSettings) {
          this.remotePlayCalled = true;
          this.sendHrRemotePlay();
          this.hrResumePending = false;
        }
        EventRegister.emit('ntrStateChanged', 'Connected');
      });
    });

    this.sock.on('data', (data: Buffer) => {
      this.readStream(data);
    });

    const activeSocket = this.sock;
    activeSocket.on('error', (error: Error) => {
      console.error('Ntr: Error', error);
      // Let the close handler decide whether an active HR session should resume.
      activeSocket.destroy();
    });

    activeSocket.on('close', () => {
      console.log('Ntr: Connection closed');
      if (this.sock === activeSocket) this.sock = null;
      const resumeHr = this.hrRemotePlayActive || this.hrResumePending;
      this.hrRemotePlayActive = false;
      this.stopHeartbeat();
      this.setState({ connected: false }, () => {
        EventRegister.emit('ntrStateChanged', 'Disconnected');
        if (resumeHr && this.streamSettings) {
          this.hrResumePending = true;
          this.scheduleHrReconnect();
        }
      });
    });
  }

  scheduleHrReconnect = () => {
    if (this.reconnectTimer || !this.hrResumePending) return;
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 15000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.state.connected && !this.sock && this.hrResumePending) this.connectToDS();
    }, delay);
  };

  disconnectFromDS = () => {
    this.tcpParser.reset();
    this.hrResumePending = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.sock) {
      this.sock.end();
      this.sock.destroy();
      this.sock = null;
    }
    this.setState({ connected: false });
    this.stopHeartbeat();
    this.remotePlayCalled = false;
    this.hrRemotePlayActive = false;
  }

  sendPacket = (type: number, cmd: Command, args: number[] = [], len: number = 0) => {
    if (!this.sock || !this.state.connected) {
      // Socket not connected
      return;
    }

    this.sequence += 1;
    const pkt = new Uint32Array(21).fill(0);
    pkt[0] = 0x12345678;
    pkt[1] = this.sequence;
    pkt[2] = type;
    pkt[3] = cmd;
    args.forEach((arg, i) => {
      pkt[i + 4] = arg;
    });
    pkt[20] = len;
    this.sock.write(Buffer.from(pkt.buffer));
  }

  readStream = (data: Buffer) => {
    try {
      const packets = this.tcpParser.push(data);
      for (const packet of packets) {
        this.lastReplyTime = Date.now();
        if (packet.payload.length) {
          EventRegister.emit('bufferFilled', [packet.payload]);
        }
        EventRegister.emit('ntrPacket', packet);
      }
    } catch (error) {
      console.error('Ntr: Invalid TCP control stream', error);
      this.disconnectFromDS();
    }
  };

  sendCommand = ({ command, args, len, data }: { command: Command, args: number[], len: number, data: string }) => {
    if (!this.state.connected) {
      console.warn("Ntr: Not connected, can't send command");
      return;
    }

    switch (command) {
      case Command.Empty:
        this.sendHeartbeat();
        break;
      case Command.WriteSave:
        this.sendPacket(1, Command.WriteSave, args, len);
        this.sock.write(data);
        break;
      case Command.Hello:
        this.sendPacket(0, Command.Hello, args, len);
        break;
      case Command.Reload:
        this.sendPacket(0, Command.Reload, args, len);
        break;
      case Command.PidList:
        this.sendPacket(0, Command.PidList, args, len);
        break;
      case Command.AttachProc:
        this.sendPacket(0, Command.AttachProc, args, len);
        break;
      case Command.ThreadList:
        this.sendPacket(0, Command.ThreadList, args, len);
        break;
      case Command.MemLayout:
        this.sendPacket(0, Command.MemLayout, args, len);
        break;
      case Command.ReadMem:
        this.sendPacket(0, Command.ReadMem, args, len);
        break;
      case Command.WriteMem:
        this.sendPacket(0, Command.WriteMem, args, len);
        break;
      case Command.Resume:
        this.sendPacket(0, Command.Resume, args, len);
        break;
      case Command.QueryHandle:
        this.sendPacket(0, Command.QueryHandle, args, len);
        break;
      case Command.RemotePlay:
        this.remotePlay();
        break;
      default:
        break;
    }
  }

  applyStreamSettings = (settings: {
    screenPriority: number;
    priorityFactor: number;
    jpegq: number;
    qosvalue: number;
    hrEnabled?: boolean;
    hrAutoQualityEnabled?: boolean;
    jpegQualityAuto?: number;
    hrBandwidthAutoKbps?: number;
    hrStreamFormat?: number;
    hrBandwidthLimit?: number;
    hrLosslessColor?: number;
    hrAudioEnabled?: boolean;
    hrFullWidthMode?: number;
  }) => {
    this.streamSettings = {
      screenPriority: settings.screenPriority,
      priorityFactor: settings.priorityFactor,
      jpegq: settings.jpegq,
      qosvalue: settings.qosvalue,
      hrEnabled: settings.hrEnabled ?? false,
      hrAutoQualityEnabled: settings.hrAutoQualityEnabled ?? false,
      jpegQualityAuto: settings.jpegQualityAuto ?? settings.jpegq,
      hrBandwidthAutoKbps: settings.hrBandwidthAutoKbps ?? ((settings.hrBandwidthLimit ?? 16) * 1000),
      hrStreamFormat: settings.hrStreamFormat ?? 0,
      hrBandwidthLimit: settings.hrBandwidthLimit ?? 16,
      hrLosslessColor: settings.hrLosslessColor ?? 2,
      hrAudioEnabled: settings.hrAudioEnabled ?? false,
      hrFullWidthMode: settings.hrFullWidthMode ?? 0,
    };

    // NTR-HR accepts RemotePlay updates over the existing control connection.
    // Do not tear down the TCP heartbeat just to change stream parameters.
    const currentSettings = this.streamSettings;
    if (this.state.connected && this.remotePlayCalled && currentSettings) {
      if (requiresHrRemotePlay(currentSettings)) {
        this.sendHrRemotePlay();
      } else if (this.hrRemotePlayActive) {
        const priority = ((currentSettings.screenPriority & 1) << 8) | (currentSettings.priorityFactor & 0xff);
        this.sendPacket(0, Command.RemotePlay, [priority, currentSettings.jpegq, currentSettings.qosvalue], 0);
        this.hrRemotePlayActive = false;
        this.startHeartbeat();
      }
    }
  };

  applyHrAutoSettings = (updates: {jpegQualityAuto: number; hrBandwidthAutoKbps: number}) => {
    if (!this.streamSettings) return;
    this.streamSettings = {
      ...this.streamSettings,
      jpegQualityAuto: updates.jpegQualityAuto,
      hrBandwidthAutoKbps: updates.hrBandwidthAutoKbps,
    };
    if (this.state.connected && this.remotePlayCalled && this.hrRemotePlayActive) {
      this.sendHrRemotePlay();
    }
  };

  sendHrRemotePlay = () => {
    if (!this.state.connected || !this.streamSettings) return;
    const settings = this.streamSettings;
    const args = buildHrRemotePlayArgs(settings);
    this.sendPacket(0, Command.RemotePlay, args, 0);
    this.hrRemotePlayActive = true;
    this.startHeartbeat();
  };

  remotePlay = () => {
    if (this.remotePlayCalled) {
      console.warn("Ntr: RemotePlay has already been called for this connection");
      return;
    }
    this.remotePlayCalled = true;

    const settings = this.streamSettings;
    if (settings && requiresHrRemotePlay(settings)) {
      this.sendHrRemotePlay();
      return;
    }

    const { screenPriority, priFact, jpegq, qosvalue } = this.props;
    const priority = settings
      ? ((settings.screenPriority << 8) | settings.priorityFactor)
      : ((screenPriority << 8) | priFact);
    this.sendPacket(0, Command.RemotePlay, [priority, settings?.jpegq ?? jpegq, settings?.qosvalue ?? qosvalue], 0);
    this.disconnectFromDS();

    setTimeout(() => {
      this.connectToDS();
    }, 3000);
  }

  render() {
    return null;
  }
}

export default Ntr;
