import { randomUUID } from 'node:crypto';
import { STATUS_CODES } from 'node:http';

import { status as grpcStatus } from '@grpc/grpc-js';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  grpcCode,
  grpcErrorCode,
  grpcMetadata,
} from '../grpc-client/grpc-error.js';
import { clientProblemCodes } from './problem.constant.js';
import { isProblem, type Problem } from './problem.js';

const grpcHttpStatus: Partial<Record<grpcStatus, number>> = {
  [grpcStatus.INVALID_ARGUMENT]: 400,
  [grpcStatus.UNAUTHENTICATED]: 401,
  [grpcStatus.PERMISSION_DENIED]: 403,
  [grpcStatus.NOT_FOUND]: 404,
  [grpcStatus.ALREADY_EXISTS]: 409,
  [grpcStatus.ABORTED]: 409,
  [grpcStatus.FAILED_PRECONDITION]: 422,
  [grpcStatus.RESOURCE_EXHAUSTED]: 429,
  [grpcStatus.UNAVAILABLE]: 503,
  [grpcStatus.UNKNOWN]: 503,
  [grpcStatus.INTERNAL]: 503,
  [grpcStatus.DEADLINE_EXCEEDED]: 504,
};

const problemDetails: Partial<Record<string, string>> = {
  ATTENDANCE_ALREADY_EXISTS: 'Absensi sudah tercatat',
  ATTENDANCE_ENTRY_NOT_FOUND: 'Data absensi tidak ditemukan',
  ATTENDANCE_NOT_FOUND: 'Data absensi tidak ditemukan',
  ATTENDANCE_WINDOW_CLOSED:
    'Waktu absensi berada di luar jadwal yang diizinkan',
  ATTENDANCE_ZONE_INACTIVE: 'Zona absensi sedang tidak aktif',
  AUTHENTICATION_REQUIRED: 'Silakan masuk terlebih dahulu',
  CLAIMED_AT_DATE_MISMATCH: 'Tanggal dan waktu absensi tidak sesuai',
  CLOCK_IN_REQUIRED: 'Clock in harus dilakukan terlebih dahulu',
  CLOCK_OUT_MUST_BE_AFTER_CLOCK_IN: 'Waktu clock out harus setelah clock in',
  DATE_RANGE_TOO_LARGE: 'Rentang tanggal terlalu panjang',
  DEPENDENCY_UNAVAILABLE: 'Layanan sedang tidak tersedia',
  DOWNSTREAM_TIMEOUT: 'Waktu permintaan habis',
  EMAIL_ALREADY_EXISTS: 'Email sudah digunakan',
  EMPLOYEE_DATA_INTEGRITY_ERROR: 'Data karyawan tidak valid',
  EMPLOYEE_NOT_FOUND: 'Karyawan tidak ditemukan',
  EMPLOYEE_NUMBER_ALREADY_EXISTS: 'Nomor karyawan sudah digunakan',
  ENTRY_NOT_PENDING_REVIEW: 'Pengajuan sudah diproses',
  EVIDENCE_ALREADY_ATTACHED: 'Bukti foto sudah digunakan',
  EVIDENCE_EXPIRED: 'Masa berlaku bukti foto telah habis',
  EVIDENCE_FINALIZATION_FAILED: 'Bukti foto gagal disimpan',
  EVIDENCE_INVALID: 'Bukti foto tidak valid',
  EVIDENCE_NOT_FOUND: 'Bukti foto tidak ditemukan',
  EVIDENCE_NOT_UPLOADED: 'Bukti foto belum diunggah',
  FORBIDDEN: 'Anda tidak memiliki izin untuk tindakan ini',
  FUTURE_CLAIMED_AT: 'Waktu absensi tidak boleh berada di masa depan',
  GPS_ACCURACY_EXCEEDS_LIMIT: 'Akurasi lokasi terlalu rendah',
  IDEMPOTENCY_KEY_REUSED:
    'Permintaan yang sama telah digunakan untuk data berbeda',
  INVALID_CREDENTIALS: 'Nomor telepon atau kata sandi salah',
  INVALID_CURSOR: 'Posisi halaman tidak valid',
  MANUAL_DATE_OUT_OF_RANGE:
    'Tanggal absensi manual berada di luar rentang yang diizinkan',
  OUTSIDE_ATTENDANCE_ZONE: 'Anda berada di luar zona absensi',
  PHONE_NUMBER_ALREADY_EXISTS: 'Nomor telepon sudah digunakan',
  RATE_LIMIT_EXCEEDED: 'Terlalu banyak permintaan. Coba lagi nanti',
  REQUEST_IN_PROGRESS: 'Permintaan sedang diproses',
  SELF_APPROVAL_FORBIDDEN: 'Anda tidak dapat menyetujui pengajuan sendiri',
  VALIDATION_ERROR: 'Data yang dikirim tidak valid',
};

const problemTitles: Partial<Record<number, string>> = {
  400: 'Permintaan tidak valid',
  401: 'Autentikasi diperlukan',
  403: 'Akses ditolak',
  404: 'Data tidak ditemukan',
  409: 'Konflik data',
  422: 'Data tidak dapat diproses',
  429: 'Terlalu banyak permintaan',
  500: 'Kesalahan internal server',
  503: 'Layanan tidak tersedia',
  504: 'Waktu permintaan habis',
};

function problemTitle(status: number) {
  return problemTitles[status] ?? STATUS_CODES[status] ?? 'Terjadi kesalahan';
}

function grpcProblem({
  exception,
  request,
  reply,
  traceId,
}: {
  exception: unknown;
  request: FastifyRequest;
  reply: FastifyReply;
  traceId: string;
}): Problem | undefined {
  const code = grpcCode(exception);

  if (code === undefined) {
    return undefined;
  }

  const status = grpcHttpStatus[code] ?? 503;
  let problemCode = grpcErrorCode(exception);

  if (!problemCode) {
    if (status === 504) {
      problemCode = 'DOWNSTREAM_TIMEOUT';
    } else if (status >= 500) {
      problemCode = 'DEPENDENCY_UNAVAILABLE';
    } else {
      problemCode = clientProblemCodes[status] ?? 'VALIDATION_ERROR';
    }
  }

  if (problemCode === 'REQUEST_IN_PROGRESS') {
    reply.header('retry-after', grpcMetadata(exception, 'retry-after') ?? '1');
  }

  const title = problemTitle(status);

  return {
    type: 'about:blank',
    title,
    status,
    detail: problemDetails[problemCode] ?? title,
    instance: request.url,
    code: problemCode,
    traceId,
  };
}

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const traceId = request.id ?? randomUUID();
    let status = 500;
    let response;
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      response = exception.getResponse();
    }

    let supplied: Problem | undefined;
    if (isProblem(response)) {
      supplied = { ...response, status, instance: request.url, traceId };
    } else {
      supplied = grpcProblem({ exception, request, reply, traceId });
    }

    let problem: Problem;
    if (supplied) {
      problem = supplied;
      status = supplied.status;
    } else if (status >= 400 && status < 500) {
      const title = problemTitle(status);

      problem = {
        type: 'about:blank',
        title,
        status,
        detail: title,
        instance: request.url,
        code: clientProblemCodes[status] ?? 'VALIDATION_ERROR',
        traceId,
      };
    } else {
      problem = {
        type: 'about:blank',
        title: 'Kesalahan internal server',
        status,
        detail: 'Terjadi kesalahan yang tidak terduga',
        instance: request.url,
        code: 'INTERNAL_ERROR',
        traceId,
      };
    }

    reply
      .header('x-correlation-id', traceId)
      .type('application/problem+json')
      .status(status)
      .send(problem);
  }
}
