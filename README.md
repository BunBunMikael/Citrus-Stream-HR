# Citrus Stream HR

Citrus Stream HR is an Android port of **NTR Viewer HR**. The Android build uses the original NTR Viewer HR C/C++ streaming, decoding, reliable-stream, and input-redirection code; it does not reimplement the NTR protocol in a separate mobile networking stack. The exact source revision supplied for this port is vendored in `android-port/upstream/` by the first Android Actions run.

## Android build

The `android-port` project builds a native arm64 Android APK with SDL 3.4.20 and the exact NTR Viewer HR source revision supplied for this port (`930f194d754141517fc247e9ce8e8392fbf70691`). The first GitHub Actions run imports that pinned upstream source into `android-port/upstream/`, applies the Android platform adaptations there, and commits the source to this repository. Subsequent builds use the vendored copy.

To build locally, provide the Android SDK/NDK, Gradle 8.11.1, SDL 3.4.20 source in `.build-sdl`, and the vendored NTR Viewer HR source in `android-port/upstream/`, then run:

```sh
python3 android-port/app/src/main/cpp/apply_android.py
gradle -p android-port assembleDebug
```

The installable debug APK is produced at `android-port/app/build/outputs/apk/debug/app-debug.apk`.

## Android interface

Both 3DS screens are rendered in a single portrait Activity, with the top screen above the bottom screen. The floating **Settings** control opens the connection and streaming settings, including 3DS IP, viewer interface, port, quality, bandwidth, compression protocol, screen priority, audio, Full Width, statistics, and auto-reconnect.

The app keeps the display awake and requests a Wi-Fi performance lock while active so Android is less likely to interrupt a stream during play.

## Upstream and licenses

- NTR Viewer HR: https://github.com/xzn/ntrviewer-hr
- SDL: https://github.com/libsdl-org/SDL
- The original upstream license and third-party notices are in the upstream source tree fetched by the build. This Android port does not replace those licenses.
