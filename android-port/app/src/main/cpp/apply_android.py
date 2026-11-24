#!/usr/bin/env python3
"""Apply the small, audited Android adaptation to the vendored NTRViewer-HR tree."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4] / "upstream"
MARKER = ROOT / ".citrus-android-patched"

if MARKER.exists():
    print(f"Android adaptation already applied to {ROOT}")
    raise SystemExit(0)


def replace_once(path: str, old: str, new: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one patch point in {path}; found {count}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "ui_common_sdl.c",
    '#elif !defined(__APPLE__)\n    SDL_SetHint(SDL_HINT_VIDEO_DRIVER, "wayland,x11");',
    '#elif !defined(__APPLE__) && !defined(__ANDROID__)\n    SDL_SetHint(SDL_HINT_VIDEO_DRIVER, "wayland,x11");',
)
replace_once(
    "ui_common_sdl.c",
    '    SDL_SetHint(SDL_HINT_JOYSTICK_ALLOW_BACKGROUND_EVENTS, "1");',
    '    SDL_SetHint(SDL_HINT_JOYSTICK_ALLOW_BACKGROUND_EVENTS, "1");\n    SDL_SetHint(SDL_HINT_TOUCH_MOUSE_EVENTS, "1");',
)
replace_once(
    "ui_common_sdl.c",
    '    change_working_directory_to_exe_path();',
    '#ifndef __ANDROID__\n    change_working_directory_to_exe_path();\n#endif',
)
replace_once(
    "ui_common_sdl.c",
    'void ui_view_mode_update(view_mode_t view_mode) {\n    SDL_SetCursor(SDL_GetDefaultCursor());',
    'void ui_view_mode_update(view_mode_t view_mode) {\n#ifdef __ANDROID__\n    (void)view_mode;\n    ui_view_mode = VIEW_MODE_TOP_BOT;\n    return;\n#endif\n    SDL_SetCursor(SDL_GetDefaultCursor());',
)
replace_once(
    "ui_common_sdl.c",
    '''int sdl_win_init(SDL_Window *sdl_win[SCREEN_COUNT], SDL_WindowFlags aflags) {
    for (int i = 0; i < SCREEN_COUNT; ++i) {
        sdl_win[i] = SDL_CreateWindow(WIN_TITLE,
            WIN_WIDTH_DEFAULT, WIN_HEIGHT_DEFAULT, SDL_WIN_FLAGS_DEFAULT | aflags);
        if (!sdl_win[i]) {
            err_log("SDL_CreateWindow (%d): %s\\n", i, SDL_GetError());
            return -1;
        }
    }

    return 0;
}''',
    '''int sdl_win_init(SDL_Window *sdl_win[SCREEN_COUNT], SDL_WindowFlags aflags) {
#ifdef __ANDROID__
    sdl_win[SCREEN_TOP] = SDL_CreateWindow(WIN_TITLE,
        WIN_WIDTH_DEFAULT, WIN_HEIGHT_DEFAULT, SDL_WIN_FLAGS_DEFAULT | aflags);
    if (!sdl_win[SCREEN_TOP]) {
        err_log("SDL_CreateWindow: %s\\n", SDL_GetError());
        return -1;
    }
    /* Android has one Activity window; both 3DS screens share it. */
    sdl_win[SCREEN_BOT] = sdl_win[SCREEN_TOP];
#else
    for (int i = 0; i < SCREEN_COUNT; ++i) {
        sdl_win[i] = SDL_CreateWindow(WIN_TITLE,
            WIN_WIDTH_DEFAULT, WIN_HEIGHT_DEFAULT, SDL_WIN_FLAGS_DEFAULT | aflags);
        if (!sdl_win[i]) {
            err_log("SDL_CreateWindow (%d): %s\\n", i, SDL_GetError());
            return -1;
        }
    }
#endif
    return 0;
}''',
)
replace_once(
    "ui_common_sdl.c",
    '''void sdl_win_destroy(SDL_Window *sdl_win[SCREEN_COUNT]) {
    for (int i = 0; i < SCREEN_COUNT; ++i) {
        if (sdl_win[i]) {
            SDL_DestroyWindow(sdl_win[i]);
            sdl_win[i] = NULL;
        }
    }
}''',
    '''void sdl_win_destroy(SDL_Window *sdl_win[SCREEN_COUNT]) {
#ifdef __ANDROID__
    if (sdl_win[SCREEN_TOP])
        SDL_DestroyWindow(sdl_win[SCREEN_TOP]);
    sdl_win[SCREEN_TOP] = sdl_win[SCREEN_BOT] = NULL;
#else
    for (int i = 0; i < SCREEN_COUNT; ++i) {
        if (sdl_win[i]) {
            SDL_DestroyWindow(sdl_win[i]);
            sdl_win[i] = NULL;
        }
    }
#endif
}''',
)
replace_once(
    "ui_renderer_sdl.c",
    '    for (int i = 0; i < SCREEN_COUNT; ++i) {\n        if (i == SCREEN_TOP) {',
    '    for (int i = 0; i < SCREEN_COUNT; ++i) {\n#ifdef __ANDROID__\n        if (i == SCREEN_BOT) {\n            sdl_renderer[i] = sdl_renderer[SCREEN_TOP];\n            continue;\n        }\n#endif\n        if (i == SCREEN_TOP) {',
)
replace_once(
    "ui_renderer_sdl.c",
    '    for (int i = 0; i < SCREEN_COUNT; ++i) {\n        if (sdl_renderer[i]) {',
    '    for (int i = 0; i < SCREEN_COUNT; ++i) {\n#ifdef __ANDROID__\n        if (i == SCREEN_BOT)\n            continue;\n#endif\n        if (sdl_renderer[i]) {',
)
replace_once(
    "ui_main_nk.c",
    'void ui_main_nk(void)\n{\n    struct nk_context *ctx = ui_nk_ctx;',
    'void ui_main_nk(void)\n{\n#ifdef __ANDROID__\n    /* Android presents its touch-first settings sheet from the Activity. */\n    return;\n#endif\n    struct nk_context *ctx = ui_nk_ctx;',
)
replace_once(
    "settings.c",
    'void settings_apply_windows(void) {\n    if (!file_settings_valid)',
    'void settings_apply_windows(void) {\n#ifdef __ANDROID__\n    return; /* One Activity window owns both screens. */\n#endif\n    if (!file_settings_valid)',
)
MARKER.write_text("Android adaptations for Citrus Stream HR\n", encoding="utf-8")
print(f"Applied Android adaptation to {ROOT}")
