/** Local HTTP/SOCKS proxies cannot be reached from the Cloudflare runtime. */
function unavailable(): never { throw new Error('Cloudflare 部署不支持本机 HTTP/SOCKS 代理，请清空代理设置。'); }
export async function fetchViaSocks5(_url: string, _host: string, _port: number): Promise<never> { return unavailable(); }
export async function fetchViaHttpProxy(_url: string, _proxy: string): Promise<never> { return unavailable(); }
export async function fetchHtmlViaSocks5(_url: string, _host: string, _port: number): Promise<never> { return unavailable(); }
