export function normalizeWorkerUrl(url: URL): URL | string {
  return url.protocol === "file:" ? `${url.pathname}${url.search}${url.hash}` : url;
}
