import tls from 'node:tls';
import https from 'node:https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { YahooPaginationResponse } from '@/types/yahoo-realtime';
const { SocksClient } = require('socks') as typeof import('socks');

const YAHOO_REQUEST_TIMEOUT_MS = 12000;
const YAHOO_HEADERS: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    Referer: "https://search.yahoo.co.jp/realtime/search",
};
export async function fetchViaSocks5(urlStr: string, proxyHost: string, proxyPort: number, retries = 2): Promise<YahooPaginationResponse> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fetchViaSocks5Once(urlStr, proxyHost, proxyPort);
        }
        catch (e) {
            if (attempt === retries)
                throw e;
            await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
        }
    }
    throw new Error("unreachable");
}
export async function fetchViaSocks5Once(urlStr: string, proxyHost: string, proxyPort: number): Promise<YahooPaginationResponse> {
    const u = new URL(urlStr);
    const host = u.hostname;
    const port = parseInt(u.port || "443", 10);
    const pathAndQuery = u.pathname + u.search;
    const { socket: rawSocket } = await SocksClient.createConnection({
        proxy: { host: proxyHost, port: proxyPort, type: 5 },
        command: "connect",
        destination: { host, port },
        timeout: YAHOO_REQUEST_TIMEOUT_MS,
    });
    const tlsSocket = tls.connect({ socket: rawSocket, servername: host });
    tlsSocket.setTimeout(YAHOO_REQUEST_TIMEOUT_MS, () => {
        tlsSocket.destroy(new Error("Yahoo SOCKS request timeout"));
    });
    await new Promise<void>((res, rej) => {
        tlsSocket.once("secureConnect", res);
        tlsSocket.once("error", rej);
    });
    const headerLines = [
        `GET ${pathAndQuery} HTTP/1.1`,
        `Host: ${host}`,
        ...Object.entries(YAHOO_HEADERS).map(([k, v]) => `${k}: ${v}`),
        "Connection: close",
        "",
        "",
    ].join("\r\n");
    tlsSocket.write(headerLines);
    const chunks: Buffer[] = [];
    await new Promise<void>((res) => {
        tlsSocket.on("data", (c: Buffer) => chunks.push(c));
        tlsSocket.on("end", res);
        tlsSocket.on("error", res);
    });
    tlsSocket.destroy();
    const raw = Buffer.concat(chunks).toString("utf8");
    // 找到 HTTP header/body 分隔线
    const bodyStart = raw.indexOf("\r\n\r\n");
    if (bodyStart === -1)
        throw new Error("Invalid HTTP response");
    let body = raw.slice(bodyStart + 4);
    const statusLine = raw.split("\r\n")[0] ?? "";
    const statusCode = parseInt(statusLine.split(" ")[1] ?? "0", 10);
    if (statusCode !== 200)
        throw new Error(`Yahoo API HTTP ${statusCode}`);
    // 正确解码 chunked transfer encoding
    if (raw.includes("Transfer-Encoding: chunked") || raw.includes("transfer-encoding: chunked")) {
        const lines = body.split("\r\n");
        let decoded = "";
        let i = 0;
        while (i < lines.length) {
            const sizeLine = lines[i++]?.trim();
            if (!sizeLine)
                continue;
            const size = parseInt(sizeLine, 16);
            if (!size)
                break;
            decoded += lines[i++] ?? "";
        }
        body = decoded || body;
    }
    return JSON.parse(body) as YahooPaginationResponse;
}
export async function fetchViaHttpProxy(urlStr: string, proxyUrl: string): Promise<YahooPaginationResponse> {
    return new Promise((resolve, reject) => {
        const request = https.get(urlStr, {
            headers: YAHOO_HEADERS,
            agent: new HttpsProxyAgent(proxyUrl),
            timeout: YAHOO_REQUEST_TIMEOUT_MS,
        }, (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (chunk: Buffer) => chunks.push(chunk));
            response.on("end", () => {
                const status = response.statusCode ?? 0;
                if (status !== 200) {
                    reject(new Error(`Yahoo API HTTP ${status}`));
                    return;
                }
                try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as YahooPaginationResponse);
                }
                catch (error) {
                    reject(error);
                }
            });
        });
        request.on("timeout", () => request.destroy(new Error("Yahoo proxy timeout")));
        request.on("error", reject);
    });
}
const BING_PAGE_TIMEOUT_MS = 12000;
const BING_HEADERS: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,ja;q=0.7,zh-CN;q=0.5",
    "Accept-Encoding": "identity",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Upgrade-Insecure-Requests": "1",
    Referer: "https://www.bing.com/",
};
export async function fetchHtmlViaSocks5(urlStr: string, proxyHost: string, proxyPort: number): Promise<string> {
    const u = new URL(urlStr);
    const host = u.hostname;
    const port = parseInt(u.port || "443", 10);
    const pathAndQuery = u.pathname + u.search;
    const { socket: rawSocket } = await SocksClient.createConnection({
        proxy: { host: proxyHost, port: proxyPort, type: 5 },
        command: "connect",
        destination: { host, port },
    });
    const tlsSocket = tls.connect({ socket: rawSocket, servername: host });
    await new Promise<void>((res, rej) => {
        tlsSocket.once("secureConnect", res);
        tlsSocket.once("error", rej);
    });
    const headerLines = [
        `GET ${pathAndQuery} HTTP/1.1`,
        `Host: ${host}`,
        ...Object.entries(BING_HEADERS).map(([k, v]) => `${k}: ${v}`),
        "Connection: close",
        "",
        "",
    ].join("\r\n");
    tlsSocket.write(headerLines);
    const chunks: Buffer[] = [];
    await new Promise<void>((res) => {
        tlsSocket.on("data", (c: Buffer) => chunks.push(c));
        tlsSocket.on("end", res);
        tlsSocket.on("error", res);
    });
    tlsSocket.destroy();
    const raw = Buffer.concat(chunks).toString("utf8");
    const bodyStart = raw.indexOf("\r\n\r\n");
    if (bodyStart === -1)
        throw new Error("Invalid HTTP response from Bing");
    let body = raw.slice(bodyStart + 4);
    const statusLine = raw.split("\r\n")[0] ?? "";
    const statusCode = parseInt(statusLine.split(" ")[1] ?? "0", 10);
    if (statusCode !== 200)
        throw new Error(`Bing HTTP ${statusCode}`);
    if (raw.includes("Transfer-Encoding: chunked") ||
        raw.includes("transfer-encoding: chunked")) {
        const lines = body.split("\r\n");
        let decoded = "";
        let i = 0;
        while (i < lines.length) {
            const sizeLine = lines[i++]?.trim();
            if (!sizeLine)
                continue;
            const size = parseInt(sizeLine, 16);
            if (!size)
                break;
            decoded += lines[i++] ?? "";
        }
        body = decoded || body;
    }
    return body;
}