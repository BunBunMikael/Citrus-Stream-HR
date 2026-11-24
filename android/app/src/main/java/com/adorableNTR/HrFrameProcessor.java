package com.adorableNTR;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import java.io.ByteArrayOutputStream;

/** Reconstructs NTR-HR's alternating even/odd downsample-2 frames. */
final class HrFrameProcessor {
    private final Bitmap[] previousHalfFrame = new Bitmap[2];

    synchronized byte[] process(byte[] jpeg, boolean isTop, boolean evenOdd) {
        Bitmap current = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.length);
        if (current == null) throw new IllegalArgumentException("Invalid HR JPEG frame");

        int screen = isTop ? 0 : 1;
        Bitmap previous = previousHalfFrame[screen];
        if (previous == null || previous.getWidth() != current.getWidth() || previous.getHeight() != current.getHeight()) {
            if (previous != null) previous.recycle();
            previousHalfFrame[screen] = null;
            previous = current;
        }

        int inputWidth = current.getWidth();
        int height = current.getHeight();
        int outputWidth = inputWidth * 2;
        int[] currentPixels = new int[inputWidth * height];
        int[] previousPixels = new int[inputWidth * height];
        int[] outputPixels = new int[outputWidth * height];
        current.getPixels(currentPixels, 0, inputWidth, 0, 0, inputWidth, height);
        previous.getPixels(previousPixels, 0, inputWidth, 0, 0, inputWidth, height);

        for (int y = 0; y < height; y++) {
            int srcRow = y * inputWidth;
            int dstRow = y * outputWidth;
            for (int x = 0; x < outputWidth; x++) {
                // The upstream renderer swaps current/previous on odd frame IDs,
                // then interleaves alternating columns from the two half frames.
                boolean useCurrent = evenOdd ? (x & 1) != 0 : (x & 1) == 0;
                int[] source = useCurrent ? currentPixels : previousPixels;
                outputPixels[dstRow + x] = source[srcRow + (x >> 1)];
            }
        }

        Bitmap output = Bitmap.createBitmap(outputPixels, outputWidth, height, Bitmap.Config.ARGB_8888);
        Bitmap nextPrevious = current.copy(Bitmap.Config.ARGB_8888, false);
        if (nextPrevious == null) {
            output.recycle();
            current.recycle();
            throw new IllegalStateException("Could not retain previous HR half-frame");
        }
        Bitmap oldPrevious = previousHalfFrame[screen];
        previousHalfFrame[screen] = nextPrevious;
        if (oldPrevious != null && oldPrevious != current) oldPrevious.recycle();
        // The retained copy is now the history frame; release the decoded input.
        current.recycle();

        ByteArrayOutputStream stream = new ByteArrayOutputStream();
        boolean compressed = output.compress(Bitmap.CompressFormat.JPEG, 100, stream);
        output.recycle();
        if (!compressed) throw new IllegalStateException("Could not encode woven HR frame");
        return stream.toByteArray();
    }

    synchronized void reset() {
        for (int i = 0; i < previousHalfFrame.length; i++) {
            if (previousHalfFrame[i] != null) {
                previousHalfFrame[i].recycle();
                previousHalfFrame[i] = null;
            }
        }
    }
}
