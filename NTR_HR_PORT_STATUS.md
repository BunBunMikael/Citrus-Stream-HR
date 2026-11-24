# NTRViewer-HR -> CuteNTR port status

Target source: `Auth-Xero/cuteNTR-react` main archive, commit `4be9fd70dca6e5de914bd83b3091a359b98b24ef`.
Reference viewer: `xzn/ntrviewer-hr`, release `0.3.9.0`, commit `930f194d754141517fc247e9ce8e8392fbf70691`.

This file is a port checklist, not a claim that HR streaming is complete.

## Work completed in this working copy

- Added screenshot capture for the currently displayed frame; dual-screen mode saves top and bottom independently.
- Changed the classic NTR Java/JNI bridge to pass the original UDP datagrams as an array instead of concatenating them and re-splitting the byte stream into assumed 1448-byte chunks.
- Added classic frame packet de-duplication, modular frame-ID ordering across 8-bit wrap, screen-ID validation, and contiguous packet-index validation before decoding.
- Reworked the TCP control stream parser to handle split/coalesced TCP events, validate/resynchronize the NTR magic, consume payload lengths safely, and track valid replies.
- Changed the heartbeat cadence to the NTR-HR 250 ms interval with a dead-link timeout and added exponential reconnect/resume for interrupted HR control sessions.
- Updated the native video surface to aspect-fit decoded frames instead of stretching every image into the legacy 400x240 ratio; this is needed for 800 px full-width frames.
- Added Android bitmap reconstruction for HR downsample-2 even/odd frames, interleaving alternating columns from successive frames per screen.
- Added a stream statistics overlay for UDP packet rate, estimated bitrate, incomplete-frame loss, duplicate packets, and current automatic quality/bandwidth values (the HR KCP/FEC connection-quality metrics are still pending).
- Ported NTRViewer-HR's AIMD automatic JPEG-quality and bandwidth controller for plain-UDP JPEG mode, including cooldowns, slider ceilings, and automatic RemotePlay updates without reconnecting.
- Added parsers for the HR KCP packet header, frame metadata, per-core terminator sizes, KCP-v2 terminator continuation, and per-core term/frame assembly. This is not connected to a KCP socket yet.
- Added a separate NTR-HR plain-UDP frame assembler for its four-byte frame header, packet reordering, end-packet handling, frame-ID wrap, and top/bottom/full-width/both-eye metadata. Completed JPEG frames are routed directly to the existing Android image surface.
- Added parsers for plain-UDP DSP audio and KCP-v2 in-band audio envelopes.
- Added Android `AudioTrack` playback for plain-UDP PCM16 stereo audio, including a bounded queue and small sequence reorder buffer. KCP-v2 audio parsing is present but not yet wired to playback.
- Added a typed NTR-HR RemotePlay argument encoder matching the seven-argument request in `ntr_hb.c`:
  - priority and priority factor;
  - JPEG quality;
  - bandwidth converted from Mbps to bytes/second;
  - HR guard value;
  - stream port and KCP/delta/lossless flags;
  - in-band audio request;
  - left/right/both-eye selection.
- Added UI settings and persistence for plain-UDP HR enablement, stream format, bandwidth ceiling, automatic quality/bandwidth, lossless color quality, audio request, and eye mode, plus live RemotePlay settings application.
- Added unit-test cases for RemotePlay arguments, TCP packet parsing, HR KCP metadata/term assembly, HR UDP frame assembly, audio envelope parsing, and the adaptive quality controller.
- Preserved the legacy three-argument RemotePlay path when the HR plain-UDP switch and all HR-only options are disabled.

## Still required before calling this a complete port

### Reliable Stream transport

- Port the NTRViewer-HR KCP receiver from `ikcp.c` / `ikcp.h`.
- Port its FEC decoder dependency (`fecal`) and test all four FEC types, packet reordering, loss, duplicate datagrams, sequence wrap, reset, and handshake behavior.
- Keep the KCP session alive and send its ACK/NACK replies back to the 3DS through UDP port 8001.
- Route KCP payloads into the HR term/frame assembler instead of the classic four-byte-header assembler.

### Video decoding

- JPEG RS: reconstruct per-core scan data, restart markers, dimensions, chroma sampling, and quality-specific JPEG headers.
- JPEG RS Delta: port the progressive delta decoder and its frame-history state.
- Lossless: port the HR Huffman/lossless decoder, color-bias handling, and lossless delta reconstruction.
- Implement quarter-downsample reconstruction and validate the even/odd weave against captured HR frames.
- Validate full-width/both-eye output on-device; the plain-UDP JPEG path now carries the HR flags and displays the JPEG dimensions, while KCP output still needs its decode/display path.
- Keep the classic JPEG/TGA and HzMod decoders isolated and unchanged.

### Audio and adaptive control

- Wire KCP-v2 audio packets into the Android `AudioTrack` player and complete the jitter/reprime handling; the plain-UDP audio path currently has initial playback support.
- Extend the adaptive controller to use KCP/FEC connection-quality metrics for JPEG RS mode once the KCP receiver is integrated.
- Extend the current UDP statistics overlay with KCP/FEC recovery, decoder timing, and HR quality metrics.
- Add HR statistics to the stream UI and ensure counters remain correct at quarter downsample.

### Validation

- Build debug and release Android variants with the project's pinned React Native/Gradle/NDK toolchain.
- Run protocol-level tests with captured packets from NTR-HR firmware, including packet loss/reordering and reconnects.
- Verify classic NTR and HzMod still work on a device.
- Verify JPEG RS, JPEG RS Delta, lossless, audio, full-width, and both-eye modes against a real 3DS running NTR-HR.

## Important current limitation

The RemotePlay settings encoder, HR plain-UDP JPEG frame assembler, HR KCP metadata/term assembler, and plain-UDP audio playback path are implemented. The HR KCP/FEC receiver and lossless video decoder are not yet implemented. HR plain-UDP JPEG mode can display completed frames; HR KCP modes and lossless frames are not yet usable. Do not treat this working copy as a finished HR-compatible release.

## Build environment notes

- TypeScript/JSX syntax transpilation passed for the edited files.
- The HR RemotePlay argument, TCP parser, HR frame metadata/term assembly, and audio envelope checks passed in a small Node test harness.
- The parser source transpiles; a standalone `tsc` invocation still reports missing ambient `buffer` types because the project dependencies are not installed.
- The edited Java bridge, HR `AudioTrack` player, HR bitmap processor, and video surface compiled against minimal Android/React Native stubs.
- `StreamWorker.cpp` passed a host C++ syntax check against JNI headers and an Android-log stub.
- A full React Native typecheck / Android Gradle build / NDK build was not possible in this environment because project dependencies and the Android SDK/NDK are not installed.

## Upstream licensing to preserve when vendoring native code

- NTRViewer-HR's `ikcp.c` / `ikcp.h` includes an MIT license.
- Its `fecal` dependency includes a BSD-style license and attribution requirements.
- Preserve the full upstream notices in the corresponding vendored source files and in the app's notices before distributing a binary.
