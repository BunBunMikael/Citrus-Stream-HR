#include <jni.h>
#include <string>
#include <cstdint>
#include <vector>
#include <android/log.h>

#define LOG_TAG "StreamWorker"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

extern "C"
JNIEXPORT jobject JNICALL
Java_com_adorableNTR_StreamWorkerModule_processPacketBuffers(JNIEnv *env, jobject thiz, jobjectArray packets) {
    std::vector<uint8_t> jpegData;
    bool isTop = false;

    jsize packetCount = env->GetArrayLength(packets);

    if (packetCount == 0) {
        return NULL;
    }

    int expectedFrameId = -1;
    int expectedScreenId = -1;
    int previousPacketNumber = -1;

    for (jsize i = 0; i < packetCount; ++i) {
        jobject byteBuffer = env->GetObjectArrayElement(packets, i);
        if (byteBuffer == NULL) {
            return NULL;
        }

        uint8_t* packetData = (uint8_t*)env->GetDirectBufferAddress(byteBuffer);
        jsize packetSize = env->GetDirectBufferCapacity(byteBuffer);

        if (packetData == NULL || packetSize <= 4) {
            return NULL;  // Return early if packet data is invalid
        }

        const int frameId = packetData[0];
        const int screenId = packetData[1] & 0x0F;
        const int packetNumber = packetData[3];

        if (i == 0) {
            expectedFrameId = frameId;
            expectedScreenId = screenId;
            isTop = (screenId == 1);
        } else if (frameId != expectedFrameId || screenId != expectedScreenId) {
            LOGE("Mixed frame or screen in one native decode request");
            return NULL;
        }

        if (packetNumber != previousPacketNumber + 1) {
            LOGE("Non-contiguous NTR packet sequence: got %d after %d", packetNumber, previousPacketNumber);
            return NULL;
        }
        previousPacketNumber = packetNumber;

        // Preserve datagram boundaries at the Java bridge; only the classic
        // NTR decoder strips its four-byte header and concatenates payloads.
        jpegData.insert(jpegData.end(), packetData + 4, packetData + packetSize);
    }

    if (jpegData.empty()) {
        return NULL;
    }

    // Create a Java byte array to return the final JPEG data
    jbyteArray result = env->NewByteArray(jpegData.size());
    if (result == NULL) {
        return NULL;
    }
    env->SetByteArrayRegion(result, 0, jpegData.size(), reinterpret_cast<jbyte*>(jpegData.data()));

    // Create a result object containing the JPEG byte array and isTop boolean
    jclass resultClass = env->FindClass("com/adorableNTR/StreamWorkerModule$Result");
    if (resultClass == NULL) {
        return NULL;
    }

    jmethodID resultConstructor = env->GetMethodID(resultClass, "<init>", "([BZ)V");
    if (resultConstructor == NULL) {
        return NULL;
    }

    jobject resultObject = env->NewObject(resultClass, resultConstructor, result, isTop ? JNI_TRUE : JNI_FALSE);
    if (resultObject == NULL) {
        return NULL;
    }

    return resultObject;
}
