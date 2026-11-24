package com.adorableNTR;

import com.facebook.react.bridge.*;
import android.util.Base64;
import java.nio.ByteBuffer;

public class StreamWorkerModule extends ReactContextBaseJavaModule {
    private final HrAudioPlayer hrAudioPlayer = new HrAudioPlayer();
    private final HrFrameProcessor hrFrameProcessor = new HrFrameProcessor();
    static {
        System.loadLibrary("native-lib");
    }



    @ReactMethod
    public void processHrJpegFrame(String base64Jpeg, boolean isTop, boolean evenOdd, Promise promise) {
        try {
            byte[] jpeg = Base64.decode(base64Jpeg, Base64.DEFAULT);
            byte[] processed = hrFrameProcessor.process(jpeg, isTop, evenOdd);
            promise.resolve(Base64.encodeToString(processed, Base64.NO_WRAP));
        } catch (Exception e) {
            promise.reject("HR Frame Error", e);
        }
    }

    @ReactMethod
    public void resetHrFrameProcessor() {
        hrFrameProcessor.reset();
    }

    @ReactMethod
    public void playHrAudio(String base64Pcm) {
        try {
            byte[] pcm = Base64.decode(base64Pcm, Base64.DEFAULT);
            hrAudioPlayer.write(pcm);
        } catch (Exception e) {
            android.util.Log.e("StreamWorkerModule", "Failed to enqueue HR audio", e);
        }
    }

    @ReactMethod
    public void stopHrAudio() {
        hrAudioPlayer.release();
    }

    private native Result processPacketBuffers(ByteBuffer[] packets);

    public static class Result {
        public final byte[] jpegData;
        public final boolean isTop;

        public Result(byte[] jpegData, boolean isTop) {
            this.jpegData = jpegData;
            this.isTop = isTop;
        }
    }

    StreamWorkerModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "StreamWorkerModule";
    }

    @ReactMethod
    public void processPackets(ReadableArray base64Packets, Promise promise) {
        try {
            if (base64Packets == null || base64Packets.size() == 0) {
                promise.reject("Processing Error", "No UDP packets supplied");
                return;
            }

            ByteBuffer[] packets = new ByteBuffer[base64Packets.size()];
            for (int i = 0; i < base64Packets.size(); i++) {
                String encoded = base64Packets.getString(i);
                if (encoded == null) {
                    promise.reject("Processing Error", "Packet " + i + " is null");
                    return;
                }
                byte[] decoded = Base64.decode(encoded, Base64.DEFAULT);
                if (decoded.length <= 4) {
                    promise.reject("Processing Error", "Packet " + i + " is shorter than the NTR header");
                    return;
                }
                ByteBuffer packet = ByteBuffer.allocateDirect(decoded.length);
                packet.put(decoded);
                packet.flip();
                packets[i] = packet;
            }

            Result result = processPacketBuffers(packets);
            if (result != null) {
                String base64Result = Base64.encodeToString(result.jpegData, Base64.NO_WRAP);
                WritableMap map = Arguments.createMap();
                map.putString("jpeg", base64Result);
                map.putBoolean("isTop", result.isTop);
                promise.resolve(map);
            } else {
                promise.reject("Processing Error", "Failed to process NTR packets");
            }
        } catch (Exception e) {
            promise.reject("Processing Error", e);
        }
    }
}
