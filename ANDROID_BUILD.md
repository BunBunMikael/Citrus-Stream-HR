# Android APK build (Android 14 / API 34)

The GitHub Actions workflow at `.github/workflows/android-apk.yml` builds both the
`debug` and `release` APK variants with:

- JDK 17
- Node.js 20 and `npm ci`
- Android SDK platform 34 and Build Tools 34.0.0
- Android NDK 26.1.10909125
- CMake 3.22.1
- The repository's Gradle 8.5 wrapper

## Run it

1. Push this project to a GitHub repository with Actions enabled.
2. Open **Actions → Android APK → Run workflow**, or push to `main` / `master`.
3. Open the completed workflow run and download the `cuteNTR-android-14-apks` artifact.
4. Install `app-debug.apk` for normal sideload testing. The `app-release.apk` is also
   built, but this project currently signs its release variant with the debug key;
   it is not a Play Store / production-signed package.

The workflow runs on pushes and pull requests to `main` and `master`, and can also
be started manually. APK artifacts are retained for 14 days.

## Android 10–14 storage behavior

Recordings on Android 10 and newer are written to the app-specific external files
folder (`Android/data/<application-id>/files/Recordings`). This avoids requesting
`MANAGE_EXTERNAL_STORAGE` or relying on the deprecated broad storage permissions,
which are restricted under scoped storage. Android 9 and older retain the legacy
write-permission path.

## Build status caveat

This workflow builds the source as it exists; a successful APK build does not mean
all NTR-HR transport/decoder features have been completed or device-validated.
See `NTR_HR_PORT_STATUS.md` for the current protocol-port status and remaining work.
