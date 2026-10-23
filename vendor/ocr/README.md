# 内置离线 OCR

当前采用第三方 **hiroi-sora/RapidOCR-json 原生 C++ 封装 + ONNX Runtime + PP-OCRv3中英文模型**，不依赖Python，不联网下载模型或上传截图。程序和模型逐字节恢复自本地旧发布目录。

原发布目录README标注来源为 [RapidOCR-json v0.2.0](https://github.com/hiroi-sora/RapidOCR-json/releases/tag/v0.2.0) / `RapidOCR-json_v0.2.0.7z`；EXE启动横幅为`RapidOCR-json v1.1.0`。包标签与二进制横幅分别记录，文件来源和SHA256见`manifest.json`。它不等于官方Python RapidOCR 3.10.0或RapidOCRLite。

`RapidOCR-json.exe`、三个ONNX模型及识别字典位于本目录和`models/`。每次点击OCR启动隐藏子进程：`--ensureAscii=1 --numThread=2 --maxSideLen=2048`；收到`OCR init completed.`后发送一次图片base64请求。结果返回、取消、截图关闭或120秒超时后结束进程，释放模型内存。

许可证随组件提供：RapidOCR-json/ONNX Runtime为MIT；RapidOcrOnnx、PaddleOCR和OpenCV为Apache-2.0。恢复后组件约29.2MiB，未压缩。

无需执行Python构建脚本。恢复资源或重新获取上游资源后应逐项核对`manifest.json`，不能仅修改文件名冒充另一模型版本。性能试验与选型结论的文字记录见 [技术存档](../../docs/engineering/ocr/2026-10-22/README.md)，不随软件安装包分发。
