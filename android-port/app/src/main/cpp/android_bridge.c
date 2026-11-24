#include <jni.h>
#include <arpa/inet.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "ntr_common.h"
#include "ntr_hb.h"
#include "ntr_rp.h"
#include "settings.h"
#include "ui_main_nk.h"
#include "ui_input_redirection.h"

static void lock_settings(void) { rp_lock_wait(ui_nk_lock); }
static void unlock_settings(void) { rp_lock_rel(ui_nk_lock); }

static jstring new_utf(JNIEnv *env, const char *value)
{
    return (*env)->NewStringUTF(env, value ? value : "");
}

JNIEXPORT jstring JNICALL
Java_com_citrusstreamhr_MainActivity_nativeGetIp(JNIEnv *env, jclass cls)
{
    char ip[20];
    (void)cls;
    snprintf(ip, sizeof(ip), "%u.%u.%u.%u",
        (unsigned)atomic_load(&ntr_ip_octet[0]),
        (unsigned)atomic_load(&ntr_ip_octet[1]),
        (unsigned)atomic_load(&ntr_ip_octet[2]),
        (unsigned)atomic_load(&ntr_ip_octet[3]));
    return new_utf(env, ip);
}

JNIEXPORT jstring JNICALL
Java_com_citrusstreamhr_MainActivity_nativeGetViewerIp(JNIEnv *env, jclass cls)
{
    const char *value = "Auto-Select";
    (void)cls;
    if (ntr_adapter_list && ntr_selected_adapter >= 0 && ntr_selected_adapter < ntr_adapter_count)
        value = ntr_adapter_list[ntr_selected_adapter];
    return new_utf(env, value);
}

JNIEXPORT jstring JNICALL
Java_com_citrusstreamhr_MainActivity_nativeGetStatus(JNIEnv *env, jclass cls)
{
    int state = atomic_load(&menu_work_state);
    int request = atomic_load(&menu_work_req_state);
    const char *status = "Disconnected";
    (void)cls;
    if (request == CONNECTION_REQ_STATE_CONNECTING)
        status = "Connecting…";
    else if (request == CONNECTION_REQ_STATE_DISCONNECTING)
        status = "Disconnecting…";
    else if (state == CONNECTION_STATE_CONNECTED)
        status = "Connected";
    return new_utf(env, status);
}

JNIEXPORT jint JNICALL
Java_com_citrusstreamhr_MainActivity_nativeGetQuality(JNIEnv *env, jclass cls)
{
    (void)env; (void)cls;
    lock_settings(); int value = ntr_rp_config.jpeg_quality; unlock_settings();
    return value;
}
JNIEXPORT jint JNICALL
Java_com_citrusstreamhr_MainActivity_nativeGetBandwidth(JNIEnv *env, jclass cls)
{
    (void)env; (void)cls;
    lock_settings(); int value = ntr_rp_config.bandwidth_limit; unlock_settings();
    return value;
}
JNIEXPORT jint JNICALL
Java_com_citrusstreamhr_MainActivity_nativeGetCompression(JNIEnv *env, jclass cls)
{
    (void)env; (void)cls;
    lock_settings(); int value = ntr_rp_config.kcp_mode; unlock_settings();
    return value;
}
JNIEXPORT jint JNICALL
Java_com_citrusstreamhr_MainActivity_nativeGetPort(JNIEnv *env, jclass cls)
{
    (void)env; (void)cls; return ntr_rp_port;
}
JNIEXPORT jint JNICALL
Java_com_citrusstreamhr_MainActivity_nativeGetPriorityFactor(JNIEnv *env, jclass cls)
{
    (void)env; (void)cls;
    lock_settings(); int value = ntr_rp_config.screen_priority_factor; unlock_settings();
    return value;
}
JNIEXPORT jboolean JNICALL
Java_com_citrusstreamhr_MainActivity_nativeGetTopPriority(JNIEnv *env, jclass cls)
{
    (void)env; (void)cls;
    lock_settings(); int value = ntr_rp_config.top_screen_priority; unlock_settings();
    return value ? JNI_TRUE : JNI_FALSE;
}
JNIEXPORT jboolean JNICALL
Java_com_citrusstreamhr_MainActivity_nativeGetAutoQuality(JNIEnv *env, jclass cls)
{
    (void)env; (void)cls; return ntr_auto_quality ? JNI_TRUE : JNI_FALSE;
}
JNIEXPORT jboolean JNICALL
Java_com_citrusstreamhr_MainActivity_nativeGetAudio(JNIEnv *env, jclass cls)
{
    (void)env; (void)cls;
    lock_settings(); int value = ntr_rp_config.audio_enable; unlock_settings();
    return value ? JNI_TRUE : JNI_FALSE;
}
JNIEXPORT jboolean JNICALL
Java_com_citrusstreamhr_MainActivity_nativeGetFullWidth(JNIEnv *env, jclass cls)
{
    (void)env; (void)cls;
    lock_settings(); int value = ntr_rp_config.full_width; unlock_settings();
    return value ? JNI_TRUE : JNI_FALSE;
}
JNIEXPORT jboolean JNICALL
Java_com_citrusstreamhr_MainActivity_nativeGetAutoReconnect(JNIEnv *env, jclass cls)
{
    (void)env; (void)cls; return ntr_auto_reconnect ? JNI_TRUE : JNI_FALSE;
}
JNIEXPORT jboolean JNICALL
Java_com_citrusstreamhr_MainActivity_nativeGetStats(JNIEnv *env, jclass cls)
{
    (void)env; (void)cls; return ntr_stats_overlay ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_com_citrusstreamhr_MainActivity_nativeSetIp(JNIEnv *env, jclass cls, jstring value)
{
    const char *text = (*env)->GetStringUTFChars(env, value, NULL);
    struct in_addr addr;
    uint8_t octets[4];
    (void)cls;
    if (!text) return;
    if (inet_pton(AF_INET, text, &addr) == 1) {
        memcpy(octets, &addr.s_addr, sizeof(octets));
        lock_settings();
        for (int i = 0; i < 4; ++i)
            atomic_store(&ntr_ip_octet[i], octets[i]);
        ntr_selected_ip = 0;
        if (ntr_auto_ip_list)
            strcpy(ntr_auto_ip_list[0], "Manual");
        ntr_get_adapter_list();
        if (atomic_load(&menu_work_state) == CONNECTION_STATE_CONNECTED)
            atomic_store(&menu_work_req_state, CONNECTION_REQ_STATE_DISCONNECTING);
        unlock_settings();
    }
    (*env)->ReleaseStringUTFChars(env, value, text);
}

JNIEXPORT jstring JNICALL
Java_com_citrusstreamhr_MainActivity_nativeAutoDetect(JNIEnv *env, jclass cls)
{
    (void)cls;
    lock_settings();
    ntr_detect_3ds_ip();
    ntr_try_auto_select_incoming_ip();
    ntr_get_adapter_list();
    unlock_settings();
    return Java_com_citrusstreamhr_MainActivity_nativeGetIp(env, cls);
}

JNIEXPORT void JNICALL
Java_com_citrusstreamhr_MainActivity_nativeRefreshNetwork(JNIEnv *env, jclass cls)
{
    (void)env; (void)cls;
    lock_settings(); ntr_get_adapter_list(); ntr_try_auto_select_adapter(); unlock_settings();
}

JNIEXPORT void JNICALL
Java_com_citrusstreamhr_MainActivity_nativeSetQuality(JNIEnv *env, jclass cls, jint value)
{
    (void)env; (void)cls;
    lock_settings(); ntr_rp_config.jpeg_quality = value; ntr_auto_q_reset_all(); kcp_restart = 1; unlock_settings();
}
JNIEXPORT void JNICALL
Java_com_citrusstreamhr_MainActivity_nativeSetBandwidth(JNIEnv *env, jclass cls, jint value)
{
    (void)env; (void)cls;
    lock_settings(); ntr_rp_config.bandwidth_limit = value; ntr_auto_q_reset_all(); kcp_restart = 1; unlock_settings();
}
JNIEXPORT void JNICALL
Java_com_citrusstreamhr_MainActivity_nativeSetCompression(JNIEnv *env, jclass cls, jint value)
{
    (void)env; (void)cls;
    if (value < 0 || value >= KCP_MODE_L_ON_DELTA + 1) return;
    lock_settings(); ntr_rp_config.kcp_mode = value; ntr_auto_q_reset_all(); kcp_restart = 1; unlock_settings();
}
JNIEXPORT void JNICALL
Java_com_citrusstreamhr_MainActivity_nativeSetPort(JNIEnv *env, jclass cls, jint value)
{
    (void)env; (void)cls;
    if (value < 1024 || value > 65535) return;
    lock_settings();
    ntr_rp_port = value;
    atomic_store(&ntr_rp_port_bound, value);
    atomic_store(&ntr_rp_port_changed, 1);
    kcp_restart = 1;
    unlock_settings();
}
JNIEXPORT void JNICALL
Java_com_citrusstreamhr_MainActivity_nativeSetPriority(JNIEnv *env, jclass cls, jboolean enabled, jint factor)
{
    (void)env; (void)cls;
    lock_settings();
    ntr_rp_config.top_screen_priority = enabled ? nk_true : nk_false;
    ntr_rp_config.screen_priority_factor = factor < 0 ? 0 : factor > 255 ? 255 : factor;
    kcp_restart = 1;
    unlock_settings();
}
JNIEXPORT void JNICALL
Java_com_citrusstreamhr_MainActivity_nativeSetAutoQuality(JNIEnv *env, jclass cls, jboolean enabled)
{
    (void)env; (void)cls;
    lock_settings(); ntr_auto_quality = enabled ? nk_true : nk_false; ntr_auto_q_reset_all(); unlock_settings();
}
JNIEXPORT void JNICALL
Java_com_citrusstreamhr_MainActivity_nativeSetAudio(JNIEnv *env, jclass cls, jboolean enabled)
{
    (void)env; (void)cls;
    lock_settings(); ntr_rp_config.audio_enable = enabled ? nk_true : nk_false; kcp_restart = 1; unlock_settings();
}
JNIEXPORT void JNICALL
Java_com_citrusstreamhr_MainActivity_nativeSetFullWidth(JNIEnv *env, jclass cls, jboolean enabled)
{
    (void)env; (void)cls;
    lock_settings(); ntr_rp_config.full_width = enabled ? nk_true : nk_false; kcp_restart = 1; unlock_settings();
}
JNIEXPORT void JNICALL
Java_com_citrusstreamhr_MainActivity_nativeSetAutoReconnect(JNIEnv *env, jclass cls, jboolean enabled)
{
    (void)env; (void)cls;
    lock_settings();
    ntr_auto_reconnect = enabled ? nk_true : nk_false;
    settings_auto_reconnect = ntr_auto_reconnect;
    if (!enabled) {
        ntr_auto_update_params = nk_false;
        settings_auto_update_params = nk_false;
    }
    unlock_settings();
}
JNIEXPORT void JNICALL
Java_com_citrusstreamhr_MainActivity_nativeSetStats(JNIEnv *env, jclass cls, jboolean enabled)
{
    (void)env; (void)cls;
    lock_settings(); ntr_stats_overlay = enabled ? nk_true : nk_false; unlock_settings();
}
JNIEXPORT void JNICALL
Java_com_citrusstreamhr_MainActivity_nativeConnect(JNIEnv *env, jclass cls)
{
    (void)env; (void)cls;
    menu_remote_play = 1;
    if (atomic_load(&menu_work_state) == CONNECTION_STATE_DISCONNECTED)
        atomic_store(&menu_work_req_state, CONNECTION_REQ_STATE_CONNECTING);
    kcp_restart = 1;
}
JNIEXPORT void JNICALL
Java_com_citrusstreamhr_MainActivity_nativeDisconnect(JNIEnv *env, jclass cls)
{
    (void)env; (void)cls;
    ntr_auto_reconnect = nk_false;
    settings_auto_reconnect = nk_false;
    if (atomic_load(&menu_work_state) == CONNECTION_STATE_CONNECTED)
        atomic_store(&menu_work_req_state, CONNECTION_REQ_STATE_DISCONNECTING);
}
JNIEXPORT void JNICALL
Java_com_citrusstreamhr_MainActivity_nativeResetDefaults(JNIEnv *env, jclass cls)
{
    (void)env; (void)cls;
    lock_settings(); ntr_config_set_default(); kcp_restart = 1; unlock_settings();
}
