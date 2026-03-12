// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import { spawn } from "child_process";
import { ApiResponse } from "../types";

/**
 * HTTP Client using curl to bypass Cloudflare TLS fingerprinting.
 * Node.js's TLS stack produces a known JA3/JA4 fingerprint that Cloudflare
 * blocks. System curl uses OpenSSL/SecureTransport with a different fingerprint.
 */
export class HttpClient {
  private baseURL: string;
  private walletAddress?: string;
  private authToken?: string;
  private timeout: number = 30;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private isAuthenticatedUrl(url?: string): boolean {
    return (
      (url?.startsWith("/api/perp-trade-api") ?? false) ||
      (url?.startsWith("/api/dipcoin-point") ?? false)
    );
  }

  private isPublicEndpoint(url?: string): boolean {
    return url?.includes("/public/") ?? false;
  }

  private buildHeaders(url: string, contentType: string = "application/json"): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": contentType };

    if (this.isAuthenticatedUrl(url)) {
      if (this.walletAddress) {
        headers["X-Wallet-Address"] = this.walletAddress;
      }
      if (this.authToken && !this.isPublicEndpoint(url)) {
        headers["Authorization"] = `Bearer ${this.authToken}`;
      }
    }

    return headers;
  }

  private curlRequest(method: string, url: string, headers: Record<string, string>, body?: string): Promise<ApiResponse> {
    return new Promise((resolve, reject) => {
      const fullUrl = `${this.baseURL}${url}`;
      const args: string[] = ["-s", "-X", method, fullUrl, "--max-time", String(this.timeout)];

      for (const [key, value] of Object.entries(headers)) {
        args.push("-H", `${key}: ${value}`);
      }

      if (body) {
        args.push("-d", body);
      }

      const proc = spawn("curl", args);
      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (chunk) => { stdout += chunk; });
      proc.stderr.on("data", (chunk) => { stderr += chunk; });

      proc.on("close", (code) => {
        if (!stdout) {
          return reject(new Error(stderr || `curl exited with code ${code}`));
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error(`Invalid JSON response: ${stdout.slice(0, 200)}`));
        }
      });

      proc.on("error", (err) => reject(err));
    });
  }

  setWalletAddress(address: string): void {
    this.walletAddress = address;
  }

  setAuthToken(token: string): void {
    this.authToken = token;
  }

  async get<T = any>(url: string, config?: { params?: Record<string, any> }): Promise<ApiResponse<T>> {
    let finalUrl = url;
    if (config?.params) {
      const qs = new URLSearchParams();
      for (const [key, value] of Object.entries(config.params)) {
        if (value !== undefined && value !== null) {
          qs.append(key, String(value));
        }
      }
      const qsStr = qs.toString();
      if (qsStr) finalUrl += `?${qsStr}`;
    }
    return this.curlRequest("GET", finalUrl, this.buildHeaders(url)) as Promise<ApiResponse<T>>;
  }

  async post<T = any>(url: string, data?: any): Promise<ApiResponse<T>> {
    const body = data ? JSON.stringify(data) : undefined;
    return this.curlRequest("POST", url, this.buildHeaders(url), body) as Promise<ApiResponse<T>>;
  }

  async postForm<T = any>(url: string, data: Record<string, any>): Promise<ApiResponse<T>> {
    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        formData.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
      }
    }
    return this.curlRequest("POST", url, this.buildHeaders(url, "application/x-www-form-urlencoded"), formData.toString()) as Promise<ApiResponse<T>>;
  }
}

