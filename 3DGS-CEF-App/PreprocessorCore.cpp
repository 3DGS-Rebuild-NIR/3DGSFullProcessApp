//PreprocessorCore.cpp
#include "PreprocessorCore.h"
#include <shlwapi.h>
#include <sstream>
#include <codecvt>
#include "ExceptionHandler.h"
#include <iostream>
#include "Utils.h"
#include "Encoding.h"

#pragma comment(lib, "shlwapi.lib")

// FFmpeg 库（替代直接运行 ffmpeg.exe / ffprobe.exe）
// include 目录与 lib 目录在 SimpleCEFApp.vcxproj 中配置
#pragma warning(push)
#pragma warning(disable: 4100 4127 4189 4244 4245 4267 4305 4312 4326 4365 4388 4389 4456 4457 4505 4702 4706 4715 4800 4996 6011)
extern "C" {
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libavutil/imgutils.h>
#include <libavutil/opt.h>
#include <libavutil/pixdesc.h>
#include <libavutil/error.h>
#include <libavutil/rational.h>
#include <libswscale/swscale.h>
}
#pragma warning(pop)

#pragma comment(lib, "avcodec.lib")
#pragma comment(lib, "avformat.lib")
#pragma comment(lib, "avutil.lib")
#pragma comment(lib, "swscale.lib")
#pragma comment(lib, "swresample.lib")

// 全局变量定义
std::string g_colmapPath;

// 字符串工具函数（UTF-8 == std::string）
static std::wstring ToWide(const std::string& utf8) { return utf8_to_wstring(utf8); }
static std::string ToUtf8(const std::wstring& wide) { return wstring_to_utf8(wide); }

// 拼接路径
static std::wstring JoinPath(const std::wstring& dir, const std::wstring& file) {
    if (dir.empty()) return file;
    wchar_t last = dir.back();
    if (last == L'\\' || last == L'/') return dir + file;
    return dir + L"\\" + file;
}

// 获取父目录
static std::wstring GetDirName(const std::wstring& path) {
    size_t pos = path.find_last_of(L"\\/");
    if (pos == std::wstring::npos) return L".";
    return path.substr(0, pos);
}

// FFmpeg 日志回调（转发到 OutputCallback）
static thread_local OutputCallback g_ffmpegLogCb;
static void FfmpegLogCallback(void* ptr, int level, const char* fmt, va_list vl) {
    (void)ptr;
    if (level > av_log_get_level()) return;
    char line[1024];
    vsnprintf(line, sizeof(line), fmt, vl);
    if (g_ffmpegLogCb) {
        g_ffmpegLogCb(std::string(line));
    }
}

// 格式化 FFmpeg 错误码
static std::string FfErr(int ret) {
    char buf[AV_ERROR_MAX_STRING_SIZE] = { 0 };
    av_strerror(ret, buf, sizeof(buf));
    return std::string(buf);
}

// 辅助函数：确保目录存在，如果不存在则创建（含中间目录）
bool EnsureDirectoryExists(const std::string& dirPath, bool critical = true) {
    if (dirPath.empty()) {
        return true;
    }

    std::wstring wdir = ToWide(dirPath);

    DWORD attrs = GetFileAttributesW(wdir.c_str());
    if (attrs != INVALID_FILE_ATTRIBUTES) {
        if (attrs & FILE_ATTRIBUTE_DIRECTORY) {
            return true;
        }
        HandleException("PathNotDirectory",
            "Path exists but is not a directory: " + dirPath, critical);
        return false;
    }

    // 逐级创建目录（支持 C:\ 与 UNC 路径）
    std::wstring cur;
    size_t i = 0;
    if (wdir.size() >= 2 && wdir[1] == L':') {
        cur = wdir.substr(0, 2); // 盘符 C:
        i = 2;
    }
    else if (wdir.size() >= 2 && wdir[0] == L'\\' && wdir[1] == L'\\') {
        size_t p1 = wdir.find(L'\\', 2);
        if (p1 != std::wstring::npos) {
            size_t p2 = wdir.find(L'\\', p1 + 1);
            if (p2 != std::wstring::npos) {
                i = p2;
                cur = wdir.substr(0, p2);
            }
            else {
                i = wdir.size();
                cur = wdir;
            }
        }
        else {
            i = wdir.size();
            cur = wdir;
        }
    }

    for (; i < wdir.size(); ++i) {
        cur += wdir[i];
        if (wdir[i] == L'\\' || wdir[i] == L'/') {
            if (GetFileAttributesW(cur.c_str()) == INVALID_FILE_ATTRIBUTES) {
                if (!CreateDirectoryW(cur.c_str(), nullptr)) {
                    HandleException("DirectoryCreationFailed",
                        "Failed to create directory: " + dirPath, critical);
                    return false;
                }
            }
        }
    }
    if (GetFileAttributesW(cur.c_str()) == INVALID_FILE_ATTRIBUTES) {
        if (!CreateDirectoryW(cur.c_str(), nullptr)) {
            HandleException("DirectoryCreationFailed",
                "Failed to create directory: " + dirPath, critical);
            return false;
        }
    }
    return true;
}

// 辅助函数：确保目录存在并返回bool（用于非关键路径）
bool EnsureDirectoryExistsNonCritical(const std::string& dirPath) {
    return EnsureDirectoryExists(dirPath, false);
}

// 初始化处理器核心
bool InitProcessorCore() {
    // 当前可执行目录
    wchar_t curDirBuf[MAX_PATH] = { 0 };
    GetCurrentDirectoryW(MAX_PATH, curDirBuf);
    std::wstring curDir = curDirBuf;
    std::wstring pluginDir = JoinPath(curDir, L"plugins");

    // 确保plugins目录存在（非关键）
    EnsureDirectoryExistsNonCritical(ToUtf8(pluginDir));

    // FFmpeg 以库方式链接，无需查找 ffmpeg.exe / ffprobe.exe
    // 设置日志级别与回调
    av_log_set_level(AV_LOG_WARNING);
    av_log_set_callback(FfmpegLogCallback);

    // 查找colmap
    if (GetFileAttributesW(JoinPath(pluginDir, L"colmap\\bin\\colmap.exe").c_str()) != INVALID_FILE_ATTRIBUTES) {
        g_colmapPath = ToUtf8(JoinPath(pluginDir, L"colmap\\bin\\colmap.exe"));
    }
    else if (GetFileAttributesW(JoinPath(curDir, L"colmap.exe").c_str()) != INVALID_FILE_ATTRIBUTES) {
        g_colmapPath = ToUtf8(JoinPath(curDir, L"colmap.exe"));
    }
    else {
        HandleException("COLMAPNotFound", "colmap.exe not found in ./plugins or current directory", true);
        return false;
    }

    return true;
}

// 解码器封装
struct Decoder {
    AVFormatContext* fmt = nullptr;
    AVCodecContext* dec = nullptr;
    int streamIdx = -1;
};

// 打开输入视频并创建解码器
static bool OpenDecoder(const std::string& filename, Decoder& d, std::string& err) {
    int ret = avformat_open_input(&d.fmt, filename.c_str(), nullptr, nullptr);
    if (ret < 0) { err = FfErr(ret); return false; }

    ret = avformat_find_stream_info(d.fmt, nullptr);
    if (ret < 0) { err = FfErr(ret); return false; }

    d.streamIdx = av_find_best_stream(d.fmt, AVMEDIA_TYPE_VIDEO, -1, -1, nullptr, 0);
    if (d.streamIdx < 0) { err = "no video stream found"; return false; }

    AVStream* st = d.fmt->streams[d.streamIdx];
    const AVCodec* decCodec = avcodec_find_decoder(st->codecpar->codec_id);
    if (!decCodec) { err = "decoder not found for codec"; return false; }

    d.dec = avcodec_alloc_context3(decCodec);
    if (!d.dec) { err = "avcodec_alloc_context3 failed"; return false; }

    ret = avcodec_parameters_to_context(d.dec, st->codecpar);
    if (ret < 0) { err = FfErr(ret); return false; }

    d.dec->pkt_timebase = st->time_base;
    d.dec->framerate = st->avg_frame_rate;

    ret = avcodec_open2(d.dec, decCodec, nullptr);
    if (ret < 0) { err = FfErr(ret); return false; }
    return true;
}

static void CloseDecoder(Decoder& d) {
    if (d.dec) avcodec_free_context(&d.dec);
    if (d.fmt) avformat_close_input(&d.fmt);
    d.dec = nullptr;
    d.fmt = nullptr;
    d.streamIdx = -1;
}

// 输出编码器封装（libx264 -> mp4）
struct Encoder {
    AVFormatContext* fmt = nullptr;
    AVCodecContext* enc = nullptr;
    AVStream* stream = nullptr;
    AVPacket* pkt = nullptr;
    int64_t frameCount = 0;
};

// 获取视频流帧率
static AVRational GetStreamFps(AVStream* st) {
    if (st->avg_frame_rate.num > 0 && st->avg_frame_rate.den > 0 &&
        st->avg_frame_rate.num >= st->avg_frame_rate.den) {
        return st->avg_frame_rate;
    }
    if (st->r_frame_rate.num > 0 && st->r_frame_rate.den > 0 &&
        st->r_frame_rate.num >= st->r_frame_rate.den) {
        return st->r_frame_rate;
    }
    return AVRational{ 25, 1 };
}

// 创建 libx264 输出 mp4
static bool OpenEncoder(const std::string& filename, int width, int height,
    AVRational fps, Encoder& e, std::string& err) {
    int ret = avformat_alloc_output_context2(&e.fmt, nullptr, nullptr, filename.c_str());
    if (ret < 0) { err = FfErr(ret); return false; }

    const AVCodec* codec = avcodec_find_encoder_by_name("libx264");
    if (!codec) { err = "libx264 encoder not found"; return false; }

    e.stream = avformat_new_stream(e.fmt, codec);
    if (!e.stream) { err = "avformat_new_stream failed"; return false; }

    e.enc = avcodec_alloc_context3(codec);
    if (!e.enc) { err = "avcodec_alloc_context3 failed"; return false; }

    e.enc->codec_type = AVMEDIA_TYPE_VIDEO;
    e.enc->width = width;
    e.enc->height = height;
    e.enc->pix_fmt = AV_PIX_FMT_YUV420P;
    e.enc->time_base = AVRational{ fps.den, fps.num };
    e.enc->framerate = fps;
    e.enc->gop_size = 12;
    e.enc->max_b_frames = 2;

    AVDictionary* opts = nullptr;
    av_dict_set(&opts, "preset", "fast", 0);
    av_dict_set(&opts, "crf", "18", 0);
    ret = avcodec_open2(e.enc, codec, &opts);
    av_dict_free(&opts);
    if (ret < 0) { err = FfErr(ret); return false; }

    e.stream->time_base = e.enc->time_base;
    ret = avcodec_parameters_from_context(e.stream->codecpar, e.enc);
    if (ret < 0) { err = FfErr(ret); return false; }

    ret = avio_open(&e.fmt->pb, filename.c_str(), AVIO_FLAG_WRITE);
    if (ret < 0) { err = FfErr(ret); return false; }

    ret = avformat_write_header(e.fmt, nullptr);
    if (ret < 0) { err = FfErr(ret); return false; }

    e.pkt = av_packet_alloc();
    return true;
}

// 写入一帧（frame == nullptr 时冲刷编码器）
static bool WriteFrame(Encoder& e, AVFrame* frame, std::string& err) {
    if (frame) frame->pts = e.frameCount++;

    int ret = avcodec_send_frame(e.enc, frame);
    if (ret < 0) { err = FfErr(ret); return false; }

    while (ret >= 0) {
        av_packet_unref(e.pkt);
        ret = avcodec_receive_packet(e.enc, e.pkt);
        if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) return true;
        if (ret < 0) { err = FfErr(ret); return false; }

        av_packet_rescale_ts(e.pkt, e.enc->time_base, e.stream->time_base);
        e.pkt->stream_index = e.stream->index;
        ret = av_interleaved_write_frame(e.fmt, e.pkt);
        if (ret < 0) { err = FfErr(ret); return false; }
    }
    return true;
}

static void CloseEncoder(Encoder& e) {
    if (e.fmt) {
        if (e.fmt->pb) av_write_trailer(e.fmt);
        avio_closep(&e.fmt->pb);
        avformat_free_context(e.fmt);
    }
    if (e.enc) avcodec_free_context(&e.enc);
    if (e.pkt) av_packet_free(&e.pkt);
    e.fmt = nullptr;
    e.enc = nullptr;
    e.stream = nullptr;
    e.pkt = nullptr;
}

bool GetVideoInfo(const std::string& videoPath,
    VideoInfo& info,
    OutputCallback callback) {

    g_ffmpegLogCb = [callback](const std::string& line) {
        if (callback) callback("[FFmpeg] " + line);
        };

    Decoder d;
    std::string err;
    if (!OpenDecoder(videoPath, d, err)) {
        if (callback) callback("[FFmpeg] open failed: " + err);
        CloseDecoder(d);
        return false;
    }

    AVStream* st = d.fmt->streams[d.streamIdx];
    if (st->codecpar) {
        info.width = st->codecpar->width;
        info.height = st->codecpar->height;
    }

    if (d.fmt->duration != AV_NOPTS_VALUE) {
        info.duration = (double)d.fmt->duration / AV_TIME_BASE;
    }
    else if (st->duration != AV_NOPTS_VALUE) {
        info.duration = (double)st->duration * av_q2d(st->time_base);
    }

    AVRational fps = GetStreamFps(st);
    info.fps = av_q2d(fps);

    if (callback) {
        callback("[FFmpeg] width=" + std::to_string(info.width) +
            " height=" + std::to_string(info.height) +
            " duration=" + std::to_string(info.duration) +
            " fps=" + std::to_string(info.fps));
    }

    CloseDecoder(d);
    return info.duration > 0 && info.height > 0 && info.width > 0;
}

// 拆分视频为 RGB 和 IR (上下分栏) —— 使用 FFmpeg 库解码裁剪后分别编码
bool SplitVideo(const std::string& videoPath,
    const std::string& outputDir,
    int height,
    OutputCallback callback) {

    if (!EnsureDirectoryExists(outputDir)) {
        return false;
    }

    std::wstring wdir = ToWide(outputDir);
    std::string rgbFile = ToUtf8(JoinPath(wdir, L"rgb.mp4"));
    std::string irFile = ToUtf8(JoinPath(wdir, L"ir.mp4"));

    auto report = [callback](const std::string& line) {
        if (callback) callback("[FFmpeg] " + line);
        };
    g_ffmpegLogCb = report;

    Decoder dec;
    std::string err;
    if (!OpenDecoder(videoPath, dec, err)) {
        report("open failed: " + err);
        CloseDecoder(dec);
        return false;
    }

    AVStream* st = dec.fmt->streams[dec.streamIdx];
    int srcWidth = st->codecpar->width;
    int srcHeight = st->codecpar->height;
    int midHeight = height / 2;
    if (midHeight <= 0 || midHeight > srcHeight / 2) {
        midHeight = srcHeight / 2;
    }
    midHeight &= ~1; // 保证偶数，避免 yuv420 色度错位
    if (midHeight <= 0) {
        report("invalid split height");
        CloseDecoder(dec);
        return false;
    }

    AVRational fps = GetStreamFps(st);

    Encoder encRgb, encIr;
    if (!OpenEncoder(rgbFile, srcWidth, midHeight, fps, encRgb, err)) {
        report("create rgb.mp4 failed: " + err);
        CloseEncoder(encRgb); CloseEncoder(encIr);
        CloseDecoder(dec);
        return false;
    }
    if (!OpenEncoder(irFile, srcWidth, midHeight, fps, encIr, err)) {
        report("create ir.mp4 failed: " + err);
        CloseEncoder(encRgb); CloseEncoder(encIr);
        CloseDecoder(dec);
        return false;
    }

    SwsContext* sws = sws_getContext(srcWidth, srcHeight, dec.dec->pix_fmt,
        srcWidth, midHeight, AV_PIX_FMT_YUV420P,
        SWS_BILINEAR, nullptr, nullptr, nullptr);
    if (!sws) {
        report("sws_getContext failed");
        CloseEncoder(encRgb); CloseEncoder(encIr);
        CloseDecoder(dec);
        return false;
    }

    AVFrame* frame = av_frame_alloc();
    AVFrame* topFrame = av_frame_alloc();
    AVFrame* botFrame = av_frame_alloc();
    AVPacket* pkt = av_packet_alloc();
    if (!frame || !topFrame || !botFrame || !pkt) {
        report("frame allocation failed");
        av_frame_free(&frame); av_frame_free(&topFrame); av_frame_free(&botFrame);
        av_packet_free(&pkt);
        sws_freeContext(sws);
        CloseEncoder(encRgb); CloseEncoder(encIr);
        CloseDecoder(dec);
        return false;
    }

    topFrame->width = srcWidth;
    topFrame->height = midHeight;
    topFrame->format = AV_PIX_FMT_YUV420P;
    botFrame->width = srcWidth;
    botFrame->height = midHeight;
    botFrame->format = AV_PIX_FMT_YUV420P;

    int topBuf = av_image_alloc(topFrame->data, topFrame->linesize,
        srcWidth, midHeight, AV_PIX_FMT_YUV420P, 32);
    int botBuf = av_image_alloc(botFrame->data, botFrame->linesize,
        srcWidth, midHeight, AV_PIX_FMT_YUV420P, 32);
    if (topBuf < 0 || botBuf < 0) {
        report("av_image_alloc failed");
        av_free(topFrame->data[0]); av_free(botFrame->data[0]);
        av_frame_free(&frame); av_frame_free(&topFrame); av_frame_free(&botFrame);
        av_packet_free(&pkt);
        sws_freeContext(sws);
        CloseEncoder(encRgb); CloseEncoder(encIr);
        CloseDecoder(dec);
        return false;
    }

    int64_t count = 0;
    bool ok = true;
    bool streamOk = true;

    auto processFrame = [&](AVFrame* f) -> bool {
        // 上半部分 -> rgb.mp4
        sws_scale(sws, f->data, f->linesize, 0, midHeight,
            topFrame->data, topFrame->linesize);
        // 下半部分 -> ir.mp4
        sws_scale(sws, f->data, f->linesize, midHeight, midHeight,
            botFrame->data, botFrame->linesize);

        if (!WriteFrame(encRgb, topFrame, err)) { streamOk = false; return false; }
        if (!WriteFrame(encIr, botFrame, err)) { streamOk = false; return false; }

        count++;
        if ((count % 100) == 0) {
            report("split frame " + std::to_string(count));
        }
        return true;
        };

    while (av_read_frame(dec.fmt, pkt) >= 0) {
        if (pkt->stream_index == dec.streamIdx) {
            avcodec_send_packet(dec.dec, pkt);
            while (avcodec_receive_frame(dec.dec, frame) == 0) {
                if (!processFrame(frame)) {
                    av_frame_unref(frame);
                    ok = false;
                    break;
                }
                av_frame_unref(frame);
            }
            if (!ok) break;
        }
        av_packet_unref(pkt);
    }

    if (ok) {
        avcodec_send_packet(dec.dec, nullptr);
        while (avcodec_receive_frame(dec.dec, frame) == 0) {
            if (!processFrame(frame)) {
                av_frame_unref(frame);
                ok = false;
                break;
            }
            av_frame_unref(frame);
        }
    }

    if (ok) {
        if (!WriteFrame(encRgb, nullptr, err)) ok = false;
        if (ok && !WriteFrame(encIr, nullptr, err)) ok = false;
    }

    if (ok && streamOk) {
        report("split complete, " + std::to_string(count) + " frames");
    }
    else if (!ok) {
        report("split failed: " + err);
    }

    if (topFrame->data[0]) av_free(topFrame->data[0]);
    if (botFrame->data[0]) av_free(botFrame->data[0]);
    av_frame_free(&frame);
    av_frame_free(&topFrame);
    av_frame_free(&botFrame);
    av_packet_free(&pkt);
    sws_freeContext(sws);
    CloseEncoder(encRgb);
    CloseEncoder(encIr);
    CloseDecoder(dec);

    return ok && streamOk;
}

// 将 RGB24 帧编码为 PNG 并写入文件
static bool WritePng(const std::wstring& path, AVFrame* rgb,
    int width, int height) {
    const AVCodec* codec = avcodec_find_encoder(AV_CODEC_ID_PNG);
    if (!codec) return false;

    AVCodecContext* enc = avcodec_alloc_context3(codec);
    if (!enc) return false;
    enc->width = width;
    enc->height = height;
    enc->pix_fmt = AV_PIX_FMT_RGB24;
    enc->time_base = AVRational{ 1, 1 };
    enc->framerate = AVRational{ 1, 1 };

    int ret = avcodec_open2(enc, codec, nullptr);
    if (ret < 0) { avcodec_free_context(&enc); return false; }

    rgb->pts = 0;
    bool ok = false;
    ret = avcodec_send_frame(enc, rgb);
    if (ret >= 0) {
        AVPacket* pkt = av_packet_alloc();
        while (ret >= 0) {
            av_packet_unref(pkt);
            ret = avcodec_receive_packet(enc, pkt);
            if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) break;
            if (ret < 0) break;
            FILE* f = nullptr;
            if (_wfopen_s(&f, path.c_str(), L"wb") != 0) break;
            fwrite(pkt->data, 1, (size_t)pkt->size, f);
            fclose(f);
            ok = true;
        }
        av_packet_free(&pkt);
    }
    avcodec_free_context(&enc);
    return ok;
}

// 提取视频帧 —— 使用 FFmpeg 库按目标帧率解码提取 PNG
bool ExtractFrames(const std::string& videoPath,
    const std::string& outputDir,
    double fps,
    OutputCallback callback) {

    if (!EnsureDirectoryExists(outputDir)) {
        return false;
    }

    std::wstring wdir = ToWide(outputDir);

    auto report = [callback](const std::string& line) {
        if (callback) callback("[FFmpeg] " + line);
        };
    g_ffmpegLogCb = report;

    Decoder dec;
    std::string err;
    if (!OpenDecoder(videoPath, dec, err)) {
        report("open failed: " + err);
        CloseDecoder(dec);
        return false;
    }

    AVStream* st = dec.fmt->streams[dec.streamIdx];
    int width = st->codecpar->width;
    int height = st->codecpar->height;

    double targetFps = fps;
    double srcFps = av_q2d(GetStreamFps(st));
    if (targetFps <= 0) targetFps = srcFps;
    if (targetFps <= 0) targetFps = 25.0;

    SwsContext* sws = sws_getContext(width, height, dec.dec->pix_fmt,
        width, height, AV_PIX_FMT_RGB24,
        SWS_BILINEAR, nullptr, nullptr, nullptr);
    if (!sws) {
        report("sws_getContext failed");
        CloseDecoder(dec);
        return false;
    }

    AVFrame* frame = av_frame_alloc();
    AVFrame* rgb = av_frame_alloc();
    AVPacket* pkt = av_packet_alloc();
    if (!frame || !rgb || !pkt) {
        report("frame allocation failed");
        av_frame_free(&frame); av_frame_free(&rgb); av_packet_free(&pkt);
        sws_freeContext(sws);
        CloseDecoder(dec);
        return false;
    }

    rgb->width = width;
    rgb->height = height;
    rgb->format = AV_PIX_FMT_RGB24;
    int rgbBuf = av_image_alloc(rgb->data, rgb->linesize,
        width, height, AV_PIX_FMT_RGB24, 32);
    if (rgbBuf < 0) {
        report("av_image_alloc failed");
        av_frame_free(&frame); av_frame_free(&rgb); av_packet_free(&pkt);
        sws_freeContext(sws);
        CloseDecoder(dec);
        return false;
    }

    double nextOutTime = 0.0;
    double elapsed = 0.0;
    int64_t frameIndex = 0;
    int64_t wrote = 0;
    bool ok = true;
    bool streamOk = true;

    auto processFrame = [&](AVFrame* f) -> bool {
        double t;
        if (f->best_effort_timestamp != AV_NOPTS_VALUE) {
            t = (double)f->best_effort_timestamp * av_q2d(st->time_base);
        }
        else {
            t = elapsed;
            elapsed += 1.0 / srcFps;
        }

        bool selected = (t >= nextOutTime - 1e-6);
        if (!selected) return true;

        nextOutTime = t + 1.0 / targetFps;

        sws_scale(sws, f->data, f->linesize, 0, height,
            rgb->data, rgb->linesize);

        frameIndex++;
        wchar_t name[32];
        swprintf(name, 32, L"%04d.png", (int)frameIndex);
        std::wstring outFile = JoinPath(wdir, name);
        if (!WritePng(outFile, rgb, width, height)) {
            streamOk = false;
            return false;
        }
        wrote++;
        if ((wrote % 50) == 0) {
            report("extracted " + std::to_string(wrote) + " frames");
        }
        return true;
        };

    while (av_read_frame(dec.fmt, pkt) >= 0) {
        if (pkt->stream_index == dec.streamIdx) {
            avcodec_send_packet(dec.dec, pkt);
            while (avcodec_receive_frame(dec.dec, frame) == 0) {
                if (!processFrame(frame)) {
                    av_frame_unref(frame);
                    ok = false;
                    break;
                }
                av_frame_unref(frame);
            }
            if (!ok) break;
        }
        av_packet_unref(pkt);
    }

    if (ok) {
        avcodec_send_packet(dec.dec, nullptr);
        while (avcodec_receive_frame(dec.dec, frame) == 0) {
            if (!processFrame(frame)) {
                av_frame_unref(frame);
                ok = false;
                break;
            }
            av_frame_unref(frame);
        }
    }

    if (ok && streamOk) {
        report("extraction complete, " + std::to_string(wrote) + " frames");
    }
    else if (!ok) {
        report("extraction failed");
    }

    if (rgb->data[0]) av_free(rgb->data[0]);
    av_frame_free(&frame);
    av_frame_free(&rgb);
    av_packet_free(&pkt);
    sws_freeContext(sws);
    CloseDecoder(dec);

    return ok && streamOk;
}

// 检查文件是否存在
static bool FileExists(const std::string& path) {
    return GetFileAttributesW(ToWide(path).c_str()) != INVALID_FILE_ATTRIBUTES;
}

// COLMAP 特征提取
bool ColmapFeatureExtractor(const std::string& imageDir,
    const std::string& databasePath,
    OutputCallback callback) {

    // 确保图像目录存在
    if (!EnsureDirectoryExists(imageDir)) {
        return false;
    }

    // 确保数据库目录存在
    if (!EnsureDirectoryExists(ToUtf8(GetDirName(ToWide(databasePath))))) {
        return false;
    }

    // 确保数据库文件不存在
    if (FileExists(databasePath)) {
        DeleteFileW(ToWide(databasePath).c_str());
    }

    std::wstring args = L"feature_extractor "
        L"--database_path \"" + ToWide(databasePath) + L"\" "
        L"--image_path \"" + ToWide(imageDir) + L"\" "
        L"--ImageReader.camera_model SIMPLE_RADIAL "
        L"--FeatureExtraction.use_gpu 0";

    auto wrapCallback = [callback](const std::string& line) {
        if (callback) {
            callback("[COLMAP] " + line);
        }
        };

    return ExecuteProcess(ToWide(g_colmapPath), args, wrapCallback);
}

// COLMAP 特征匹配
bool ColmapExhaustiveMatcher(const std::string& databasePath,
    OutputCallback callback) {

    // 确保数据库目录存在
    if (!EnsureDirectoryExists(ToUtf8(GetDirName(ToWide(databasePath))))) {
        return false;
    }

    // 确保数据库文件存在
    if (!FileExists(databasePath)) {
        HandleException("DatabaseNotFound",
            "Database file not found: " + databasePath, true);
        return false;
    }

    std::wstring args = L"exhaustive_matcher "
        L"--database_path \"" + ToWide(databasePath) + L"\" "
        L"--FeatureMatching.use_gpu 0";

    auto wrapCallback = [callback](const std::string& line) {
        if (callback) {
            callback("[COLMAP] " + line);
        }
        };

    return ExecuteProcess(ToWide(g_colmapPath), args, wrapCallback);
}

// COLMAP 稀疏重建
bool ColmapMapper(const std::string& imageDir,
    const std::string& databasePath,
    const std::string& outputPath,
    OutputCallback callback) {

    // 确保图像目录存在
    if (!EnsureDirectoryExists(imageDir)) {
        return false;
    }

    // 确保数据库目录存在
    if (!EnsureDirectoryExists(ToUtf8(GetDirName(ToWide(databasePath))))) {
        return false;
    }

    // 确保数据库文件存在
    if (!FileExists(databasePath)) {
        HandleException("DatabaseNotFound",
            "Database file not found: " + databasePath, true);
        return false;
    }

    // 确保输出目录存在
    if (!EnsureDirectoryExists(outputPath)) {
        return false;
    }

    std::wstring args = L"mapper "
        L"--database_path \"" + ToWide(databasePath) + L"\" "
        L"--image_path \"" + ToWide(imageDir) + L"\" "
        L"--output_path \"" + ToWide(outputPath) + L"\"";

    auto wrapCallback = [callback](const std::string& line) {
        if (callback) {
            callback("[COLMAP] " + line);
        }
        };

    return ExecuteProcess(ToWide(g_colmapPath), args, wrapCallback);
}