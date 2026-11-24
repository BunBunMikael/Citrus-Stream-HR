cmake_minimum_required(VERSION 3.22.1)
project(CitrusStreamHR LANGUAGES C CXX)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)

if(NOT ANDROID)
    message(FATAL_ERROR "Android NDK build required")
endif()
if(NOT EXISTS "${SDL_SOURCE_DIR}/CMakeLists.txt" OR NOT EXISTS "${NTR_SOURCE_DIR}/main.c")
    message(FATAL_ERROR "SDL_SOURCE_DIR or NTR_SOURCE_DIR is invalid")
endif()

set(SDL_SHARED ON CACHE BOOL "" FORCE)
set(SDL_STATIC OFF CACHE BOOL "" FORCE)
set(SDL_TESTS OFF CACHE BOOL "" FORCE)
set(SDL_EXAMPLES OFF CACHE BOOL "" FORCE)
set(SDL_INSTALL OFF CACHE BOOL "" FORCE)
add_subdirectory("${SDL_SOURCE_DIR}" "${CMAKE_BINARY_DIR}/SDL3")

set(JPEG_INCLUDES
    "${NTR_SOURCE_DIR}/jpeg_turbo"
    "${NTR_SOURCE_DIR}/jpeg_turbo/src"
    "${NTR_SOURCE_DIR}/jpeg_turbo/include"
    "${NTR_SOURCE_DIR}/jpeg_turbo/simd"
    "${NTR_SOURCE_DIR}/jpeg_turbo/simd/arm"
    "${NTR_SOURCE_DIR}/jpeg_turbo/simd/aarch64")

file(GLOB JPEG16 "${NTR_SOURCE_DIR}/jpeg_turbo/jpeg16/*.c")
file(GLOB JPEG12 "${NTR_SOURCE_DIR}/jpeg_turbo/jpeg12/*.c")
file(GLOB JPEG8 "${NTR_SOURCE_DIR}/jpeg_turbo/jpeg8/*.c")
add_library(jpeg16 OBJECT ${JPEG16})
add_library(jpeg12 OBJECT ${JPEG12} ${JPEG16})
add_library(jpeg8 OBJECT ${JPEG8} ${JPEG12} ${JPEG16})
foreach(target jpeg16 jpeg12 jpeg8)
    target_include_directories(${target} PRIVATE ${JPEG_INCLUDES})
    target_compile_options(${target} PRIVATE -Wno-unused-parameter -Wno-sign-compare -Wno-stringop-overflow)
endforeach()
target_compile_definitions(jpeg16 PRIVATE BITS_IN_JSAMPLE=16 GIF_SUPPORTED PPM_SUPPORTED)
target_compile_definitions(jpeg12 PRIVATE BITS_IN_JSAMPLE=12 GIF_SUPPORTED PPM_SUPPORTED)
target_compile_definitions(jpeg8 PRIVATE BITS_IN_JSAMPLE=8 BMP_SUPPORTED GIF_SUPPORTED PPM_SUPPORTED)

file(GLOB JPEG_ROOT "${NTR_SOURCE_DIR}/jpeg_turbo/*.c")
set_source_files_properties(${JPEG_ROOT} PROPERTIES COMPILE_DEFINITIONS "BMP_SUPPORTED;GIF_SUPPORTED;PPM_SUPPORTED")
file(GLOB JPEG_ARM "${NTR_SOURCE_DIR}/jpeg_turbo/simd/arm/*.c" "${NTR_SOURCE_DIR}/jpeg_turbo/simd/arm/aarch64/*.c")
set_source_files_properties(${JPEG_ARM} PROPERTIES COMPILE_DEFINITIONS NEON_INTRINSICS)
file(GLOB NUKLEAR "${NTR_SOURCE_DIR}/nuklear/*.c")
file(GLOB FEC "${NTR_SOURCE_DIR}/fecal/*.cpp")

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
    ${NUKLEAR} ${JPEG_ROOT} ${JPEG_ARM} ${FEC}
    $<TARGET_OBJECTS:jpeg8>
    $<TARGET_OBJECTS:jpeg12>
    $<TARGET_OBJECTS:jpeg16>)

add_library(main SHARED ${NTR_SOURCES})
target_include_directories(main PRIVATE
    "${NTR_SOURCE_DIR}" "${NTR_SOURCE_DIR}/include"
    ${JPEG_INCLUDES})
target_compile_definitions(main PRIVATE USE_SDL_RENDERER_ONLY EMBED_JPEG_TURBO GF256_TARGET_MOBILE _GNU_SOURCE)
target_compile_options(main PRIVATE
    -O3 -fno-strict-aliasing -ffunction-sections -fdata-sections
    -Wno-unused-parameter -Wno-unused-function -Wno-missing-field-initializers
    -Wno-sign-compare -Wno-stringop-overflow -Wno-implicit-fallthrough -Wno-restrict)
target_link_options(main PRIVATE -Wl,--gc-sections)
target_link_libraries(main PRIVATE SDL3::SDL3 android log m)
set_target_properties(main PROPERTIES OUTPUT_NAME main)
