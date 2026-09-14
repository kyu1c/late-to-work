// src/lib/api/http.ts

import { ApiResult } from '../types';

/**
 * 서버 전용 HTTP 요청 헬퍼.
 * - 키·프록시 주소는 여기서만 다루며, 클라이언트에는 절대 노출되지 않는다.
 * - 성공/실패/폴백 필요 여부를 ApiResult로 반환한다.
 */

export interface HttpRequestOptions {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

function isNetworkOrTimeoutError(err: unknown): boolean {
  if (err instanceof TypeError) {
    // fetch에서 네트워크 실패, DNS 실패, 오프라인 등은 보통 TypeError로 떨어진다
    return true;
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const message = String((err as { message: unknown }).message);
    const lowered = message.toLowerCase();
    return lowered.includes('fetch') || lowered.includes('network') || lowered.includes('abort');
  }
  return false;
}

function isHttpError(status: number): boolean {
  return status >= 400;
}

/**
 * GET/POST 요청을 보내고 JSON 응답을 파싱한다.
 * 실패 시 '무엇이 실패했는지'를 오류 유형과 함께 남긴다.
 */
export async function jsonRequest<T>(
  opts: HttpRequestOptions,
): Promise<ApiResult<T>> {
  const { url, method = 'GET', headers, body, timeoutMs = 12000 } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchInit: RequestInit = {
      method,
      headers: new Headers(headers),
      signal: controller.signal,
    };

    if (body !== undefined) {
      fetchInit.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchInit);

    if (!response.ok) {
      let detail = '';
      try {
        const text = await response.text();
        if (text.length > 0) {
          detail = text.slice(0, 500);
        }
      } catch {
        // 본문을 읽지 못해도 상태코드는 확인 가능
      }

      const isAuthFailure = response.status === 401 || response.status === 403;

      return {
        ok: false,
        error: `HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
        fallback: isAuthFailure || isHttpError(response.status),
      };
    }

    if (!response.headers.get('content-type')?.includes('application/json')) {
      return {
        ok: false,
        error: `Expected JSON but got non-JSON response (status ${response.status})`,
        fallback: true,
      };
    }

    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch (err) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        error: `Request timeout after ${timeoutMs}ms (url: ${url})`,
        fallback: true,
      };
    }

    const isNetwork = isNetworkOrTimeoutError(err);
    return {
      ok: false,
      error: isNetwork
        ? `Network/connection error for ${url}`
        : `Unexpected request error for ${url}`,
      fallback: isNetwork,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET 전용 편의 함수.
 */
export async function getJson<T>(url: string, headers?: Record<string, string>, timeoutMs?: number): Promise<ApiResult<T>> {
  return jsonRequest<T>({ url, method: 'GET', headers, timeoutMs });
}

/**
 * POST 전용 편의 함수.
 */
export async function postJson<T>(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
  timeoutMs?: number,
): Promise<ApiResult<T>> {
  return jsonRequest<T>({ url, method: 'POST', headers, body, timeoutMs });
}

/**
 * 실패 결과를 폴백 필요 여부까지 요약한다.
 * - authFailure: 인증/권한 실패 (키를 바로 점검해야 함)
 * - notFoundOrEmpty: 정상 호출이나 데이터 없음
 * - error: 그 외 오류 (네트워크, 타임아웃, 파싱 실패 등)
 */
export function classifyFailure(result: ApiResult<unknown>): {
  kind: 'ok' | 'authFailure' | 'notFoundOrEmpty' | 'error';
  error: string;
} {
  if (result.ok) {
    return { kind: 'ok', error: '' };
  }

  const lowered = result.error.toLowerCase();

  if (result.error.includes('HTTP 401') || result.error.includes('HTTP 403')) {
    return { kind: 'authFailure', error: result.error };
  }

  if (
    lowered.includes('no_data') ||
    lowered.includes('no data') ||
    lowered.includes('empty') ||
    lowered.includes('nodata') ||
    result.error.includes('non-JSON')
  ) {
    return { kind: 'notFoundOrEmpty', error: result.error };
  }

  return { kind: 'error', error: result.error };
}
