async function decodeImage(buffer, extension, { nativeImage, BrowserWindow }) {
  let image = nativeImage.createFromBuffer(buffer);
  if (!image.isEmpty()) return image;
  const mime = {'.png':'png','.jpg':'jpeg','.jpeg':'jpeg','.bmp':'bmp','.webp':'webp','.gif':'gif'}[extension];
  if (!mime) throw new Error('不支持的图片格式');
  // Chromium handles common formats that NativeImage cannot decode, including WebP/BMP/GIF.
  const decoder = new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  decoder.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  decoder.webContents.on('will-navigate',event=>event.preventDefault());
  let timer;
  try {
    const run = async () => {
      await decoder.loadURL('data:text/html,'+encodeURIComponent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:">'));
      const data = await decoder.webContents.executeJavaScript(`(async () => {
        const image = new Image();
        image.src = ${JSON.stringify('data:image/'+mime+';base64,'+buffer.toString('base64'))};
        await image.decode();
        if (!image.naturalWidth || image.naturalWidth*image.naturalHeight > 64000000) throw new Error('图片尺寸过大');
        const canvas = document.createElement('canvas');
        canvas.width=image.naturalWidth; canvas.height=image.naturalHeight;
        canvas.getContext('2d').drawImage(image,0,0);
        return canvas.toDataURL('image/png');
      })()`);
      image = nativeImage.createFromDataURL(data);
      if (image.isEmpty()) throw new Error('图片解码失败');
      return image;
    };
    return await Promise.race([run(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('图片打开超时')),20000);})]);
  } catch {
    throw new Error('图片无法读取、已损坏或尺寸过大');
  } finally {
    clearTimeout(timer);
    if (!decoder.isDestroyed()) decoder.destroy();
  }
}
module.exports = {decodeImage};
