cmake_minimum_required(VERSION 3.22.1)
project(CitrusStreamHR LANGUAGES C CXX)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT ANDROID)
    message(FATAL_ERROR "This CMake project is intended for the Android NDK")
endif()
if(NOT EXISTS "${SDL_SOURCE_DIR}/CMakeLists.txt")
    message(FATAL_ERROR "SDL_SOURCE_DIR must point to the SDL 3.4.20 source tree")
endif()
if(NOT EXISTS "${NTR_SOURCE_DIR}/main.c")
    message(FATAL_ERROR "NTR_SOURCE_DIR must point to the pinned NTRViewer-HR source tree")
endif()

set(SDL_SHARED ON CACHE BOOL "Build SDL as a shared library" FORCE)
set(SDL_STATIC OFF CACHE BOOL "Do not build a static SDL copy" FORCE)
set(SDL_TESTS OFF CACHE BOOL "Do not build SDL tests" FORCE)
set(SDL_EXAMPLES OFF CACHE BOOL "Do not build SDL examples" FORCE)
set(SDL_INSTALL OFF CACHE BOOL "Do not install SDL" FORCE)
add_subdirectory("${SDL_SOURCE_DIR}" "${CMAKE_BINARY_DIR}/SDL3")

# The upstream Makefile builds three JPEG precision variants from shared source
# files. Keep those object sets separate so their BITS_IN_JSAMPLE definitions
# cannot leak into one another.
file(GLOB JPEG16 CONFIGURE_DEPENDS "${NTR_SOURCE_DIR}/jpeg_turbo/jpeg16/*.c")
file(GLOB JPEG12 CONFIGURE_DEPENDS "${NTR_SOURCE_DIR}/jpeg_turbo/jpeg12/*.c")
file(GLOB JPEG8 CONFIGURE_DEPENDS "${NTR_SOURCE_DIR}/jpeg_turbo/jpeg8/*.c")

add_library(jpeg16 OBJECT ${JPEG16})
target_include_directories(jpeg16 PRIVATE "${NTR_SOURCE_DIR}/jpeg_turbo" "${NTR_SOURCE_DIR}/jpeg_turbo/include"
    "${NTR_SOURCE_DIR}/jpeg_turbo/simd"
    "${NTR_SOURCE_DIR}/jpeg_turbo/simd/arm"
    "${NTR_SOURCE_DIR}/jpeg_turbo/simd/arm/aarch64")
target_compile_definitions(jpeg16 PRIVATE BITS_IN_JSAMPLE=16 GIF_SUPPORTED PPM_SUPPORTED)
target_compile_options(jpeg16 PRIVATE -Wno-unused-parameter -Wno-sign-compare -Wno-stringop-overflow)

add_library(jpeg12 OBJECT ${JPEG12} ${JPEG16})
target_include_directories(jpeg12 PRIVATE "${NTR_SOURCE_DIR}/jpeg_turbo" "${NTR_SOURCE_DIR}/jpeg_turbo/include"
    "${NTR_SOURCE_DIR}/jpeg_turbo/simd"
    "${NTR_SOURCE_DIR}/jpeg_turbo/simd/arm"
    "${NTR_SOURCE_DIR}/jpeg_turbo/simd/arm/aarch64")
target_compile_definitions(jpeg12 PRIVATE BITS_IN_JSAMPLE=12 GIF_SUPPORTED PPM_SUPPORTED)
target_compile_options(jpeg12 PRIVATE -Wno-unused-parameter -Wno-sign-compare -Wno-stringop-overflow)

add_library(jpeg8 OBJECT ${JPEG8} ${JPEG12} ${JPEG16})
target_include_directories(jpeg8 PRIVATE "${NTR_SOURCE_DIR}/jpeg_turbo" "${NTR_SOURCE_DIR}/jpeg_turbo/include"
    "${NTR_SOURCE_DIR}/jpeg_turbo/simd"
    "${NTR_SOURCE_DIR}/jpeg_turbo/simd/arm"
    "${NTR_SOURCE_DIR}/jpeg_turbo/simd/arm/aarch64")
target_compile_definitions(jpeg8 PRIVATE BITS_IN_JSAMPLE=8 BMP_SUPPORTED GIF_SUPPORTED PPM_SUPPORTED)
target_compile_options(jpeg8 PRIVATE -Wno-unused-parameter -Wno-sign-compare -Wno-stringop-overflow)

file(GLOB JPEG_ROOT CONFIGURE_DEPENDS "${NTR_SOURCE_DIR}/jpeg_turbo/*.c")
file(GLOB JPEG_ARM CONFIGURE_DEPENDS
    "${NTR_SOURCE_DIR}/jpeg_turbo/simd/arm/*.c"
    "${NTR_SOURCE_DIR}/jpeg_turbo/simd/arm/aarch64/*.c")
set_source_files_properties(${JPEG_ARM} PROPERTIES COMPILE_DEFINITIONS NEON_INTRINSICS)

file(GLOB NUKLEAR_SOURCES CONFIGURE_DEPENDS "${NTR_SOURCE_DIR}/nuklear/*.c")
file(GLOB FEC_SOURCES CONFIGURE_DEPENDS "${NTR_SOURCE_DIR}/fecal/*.cpp")

set(NTR_SOURCES
    "${NTR_SOURCE_DIR}/main.c"
    "${NTR_SOURCE_DIR}/rp_syn.c"
    "${NTR_SOURCE_DIR}/ikcp.c"
    "${NTR_SOURCE_DIR}/libSTB_image.c"
    "${NTR_SOURCE_DIR}/libNK_SDL_renderer.c"
    "${NTR_SOURCE_DIR}/ui_common_sdl.c"
    "${NTR_SOURCE_DIR}/ui_renderer_sdl.c"
    "${NTR_SOURCE_DIR}/ui_main_nk.c"
    "${NTR_SOURCE_DIR}/ui_input_redirection.c"
    "${NTR_SOURCE_DIR}/ntr_common.c"
    "${NTR_SOURCE_DIR}/ntr_hb.c"
    "${NTR_SOURCE_DIR}/ntr_rp.c"
    "${NTR_SOURCE_DIR}/ntr_huff.c"
    "${NTR_SOURCE_DIR}/ntr_jpeg_delta.c"
    "${NTR_SOURCE_DIR}/ntr_stats_overlay.c"
    "${NTR_SOURCE_DIR}/ntr_audio.c"
    "${NTR_SOURCE_DIR}/settings.c"
    "${CMAKE_CURRENT_LIST_DIR}/android_bridge.c"
    ${NUKLEAR_SOURCES}
    ${JPEG_ROOT}
    ${JPEG_ARM}
    ${FEC_SOURCES}
    $<TARGET_OBJECTS:jpeg8>
    $<TARGET_OBJECTS:jpeg12>
    $<TARGET_OBJECTS:jpeg16>)

add_library(main SHARED ${NTR_SOURCES})
target_include_directories(main PRIVATE
    "${NTR_SOURCE_DIR}"
    "${NTR_SOURCE_DIR}/include"
    "${NTR_SOURCE_DIR}/jpeg_turbo"
    "${NTR_SOURCE_DIR}/jpeg_turbo/include"
    "${NTR_SOURCE_DIR}/jpeg_turbo/simd"
    "${NTR_SOURCE_DIR}/jpeg_turbo/simd/arm"
    "${NTR_SOURCE_DIR}/jpeg_turbo/simd/arm/aarch64")
target_compile_definitions(main PRIVATE
    USE_SDL_RENDERER_ONLY
    EMBED_JPEG_TURBO
    GF256_TARGET_MOBILE
    _GNU_SOURCE)
target_compile_options(main PRIVATE
    -O3
    -fno-strict-aliasing
    -ffunction-sections
    -fdata-sections
    -Wno-unused-parameter
    -Wno-unused-function
    -Wno-missing-field-initializers
    -Wno-sign-compare
    -Wno-stringop-overflow
    -Wno-implicit-fallthrough
    -Wno-restrict)
target_link_options(main PRIVATE -Wl,--gc-sections)
target_link_libraries(main PRIVATE SDL3::SDL3 android log m)

# SDLActivity loads libSDL3.so and then libmain.so.
set_target_properties(main PROPERTIES OUTPUT_NAME "main")
