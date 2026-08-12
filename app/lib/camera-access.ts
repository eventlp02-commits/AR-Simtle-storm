export class CameraPermissionTimeoutError extends Error {
  constructor() {
    super("摄像头权限请求超时");
    this.name = "CameraPermissionTimeoutError";
  }
}

export interface CameraEnvironment {
  secureContext: boolean;
  hostname: string;
  embedded: boolean;
  hasMediaDevices: boolean;
  userAgent: string;
}

export function cameraEnvironmentIssue(environment: CameraEnvironment) {
  const localHost = environment.hostname === "localhost" || environment.hostname === "127.0.0.1";
  if (!environment.secureContext && !localHost) {
    return "摄像头只能在 HTTPS 安全页面中使用。请打开正式部署链接。";
  }
  if (!environment.hasMediaDevices) {
    return "当前浏览器不支持摄像头访问，请使用最新版系统 Chrome。";
  }
  const inAppBrowser = /MicroMessenger|DingTalk|Feishu|Lark|QQ\/|FBAN|FBAV|Instagram|Line\//i.test(
    environment.userAgent,
  );
  if (environment.embedded || inAppBrowser) {
    return "当前页面位于内嵌浏览器中，摄像头权限可能被禁用。请复制链接并使用系统 Chrome 打开。";
  }
  return null;
}

export function requestCameraStream(
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
  constraints: MediaStreamConstraints,
  timeoutMs: number,
) {
  return new Promise<MediaStream>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new CameraPermissionTimeoutError());
    }, timeoutMs);

    getUserMedia(constraints).then(
      (stream) => {
        if (settled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(stream);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
