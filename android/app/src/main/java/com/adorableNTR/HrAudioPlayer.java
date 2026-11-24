package com.adorableNTR;

import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.util.Log;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** Streams NTR-HR DSP PCM16 stereo frames to Android AudioTrack. */
final class HrAudioPlayer {
    private static final String TAG = "HrAudioPlayer";
    private static final int SAMPLE_RATE = 32728;
    private static final int FRAME_BYTES = 640;

    // Bound queued audio to roughly 160 ms; dropping the oldest queued write
    // is preferable to building unbounded latency when the device is overloaded.
    private final ThreadPoolExecutor audioQueue = new ThreadPoolExecutor(
        1, 1, 30L, TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(32),
        new ThreadPoolExecutor.DiscardOldestPolicy()
    );
    private AudioTrack track;

    HrAudioPlayer() {
        audioQueue.allowCoreThreadTimeOut(true);
    }

    void write(byte[] pcm) {
        if (pcm == null || pcm.length == 0 || pcm.length % FRAME_BYTES != 0) return;
        final byte[] copy = pcm.clone();
        audioQueue.execute(() -> {
            try {
                ensureTrack();
                if (track == null) return;
                int offset = 0;
                while (offset < copy.length) {
                    int written = track.write(copy, offset, copy.length - offset);
                    if (written <= 0) {
                        Log.w(TAG, "AudioTrack write returned " + written);
                        break;
                    }
                    offset += written;
                }
            } catch (Throwable error) {
                Log.e(TAG, "Unable to play HR audio packet", error);
                releaseTrack();
            }
        });
    }

    void stop() {
        audioQueue.execute(() -> {
            if (track != null) {
                try {
                    track.pause();
                    track.flush();
                } catch (Throwable error) {
                    Log.w(TAG, "Error flushing HR audio", error);
                }
            }
        });
    }

    void release() {
        audioQueue.execute(this::releaseTrack);
    }

    private void ensureTrack() {
        if (track != null && track.getState() == AudioTrack.STATE_INITIALIZED) {
            if (track.getPlayState() != AudioTrack.PLAYSTATE_PLAYING) track.play();
            return;
        }
        releaseTrack();
        int minBuffer = AudioTrack.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_OUT_STEREO,
            AudioFormat.ENCODING_PCM_16BIT
        );
        if (minBuffer <= 0) {
            Log.e(TAG, "AudioTrack returned invalid minimum buffer size: " + minBuffer);
            return;
        }
        int bufferSize = Math.max(minBuffer, FRAME_BYTES * 8);
        track = new AudioTrack(
            AudioManager.STREAM_MUSIC,
            SAMPLE_RATE,
            AudioFormat.CHANNEL_OUT_STEREO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize,
            AudioTrack.MODE_STREAM
        );
        if (track.getState() != AudioTrack.STATE_INITIALIZED) {
            Log.e(TAG, "AudioTrack initialization failed");
            releaseTrack();
            return;
        }
        track.play();
    }

    private void releaseTrack() {
        if (track == null) return;
        try {
            track.pause();
            track.flush();
            track.stop();
        } catch (Throwable error) {
            Log.w(TAG, "Error stopping HR AudioTrack", error);
        }
        try {
            track.release();
        } catch (Throwable error) {
            Log.w(TAG, "Error releasing HR AudioTrack", error);
        }
        track = null;
    }
}
