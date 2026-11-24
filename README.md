# Citrus Stream HR

Citrus Stream HR is an Android port of **NTR Viewer HR**. The Android build uses the original NTR Viewer HR C/C++ streaming, decoding, reliable-stream, and input-redirection code; it does not reimplement the NTR protocol in a separate mobile networking stack.

## Android build

The `android-port` project builds an arm64 Android APK with SDL 3.4.20 and the pinned NTR Viewer HR source revision `930f194d754141517fc247e9ce8e8392fbf70691`, vendored in `android-port/upstream/`. Android-specific source changes are kept in that vendored tree and the companion build configuration.

The minimum Android version is **Android 7.0 (API 24)**. The current workflow produces a debug APK for arm64 devices.

GitHub Actions builds the APK on pushes to `main` that change the Android port, and also supports manual runs. The artifact is named `Citrus-Stream-HR-Android-debug`.

## Android interface

Both 3DS screens are rendered in one portrait Activity, with the top screen above the bottom screen. The floating **Settings** control opens a touch-friendly menu with connection IP/interface/port, quality, bandwidth, compression, screen priority, upscaling, ambience, HR audio and Full Width options, auto-reconnect, input-controller selection, statistics, and screenshot controls.

The app keeps the display awake and requests a Wi-Fi performance lock while active so Android is less likely to interrupt a stream during play.

## Upstream and licenses

- NTR Viewer HR: https://github.com/xzn/ntrviewer-hr
- SDL: https://github.com/libsdl-org/SDL
- The original upstream license and third-party notices are retained in `android-port/upstream/`. This Android port does not replace those licenses.
