import express, { type ErrorRequestHandler, type Request, type Response, type RequestHandler, type Router } from "express";
import crypto from "node:crypto";
import type { StyleTransferService } from "../application/styleTransferService";
import type { StyleTransferRequest, StyleTransferResponse } from "../application/applicationTypes";
import { ModelRouterError } from "../infrastructure/modelRouter";

export interface StyleTransferJobRecord {
  jobId: string;
  requestId: string;
  status: "running" | "completed" | "failed";
  stage: "preparing" | "executing" | "completed" | "failed";
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  httpStatus?: number;
  result?: StyleTransferResponse;
  error?: { code: string; message: string };
}

export interface StyleTransferPreparationInput {
  requestId: string;
  sourceText: string;
  donorText: string;
  unfilteredMode?: boolean;
  signal: AbortSignal;
}

/**
 * The API deliberately does not accept a client-created semantic inventory or
 * donor baseline. The server-side preparer must extract and validate source
 * propositions, analyze the donor corpus, and create the frozen baseline.
 */
export type StyleTransferRequestPreparer = (
  input: StyleTransferPreparationInput,
) => Promise<Omit<StyleTransferRequest, "requestId" | "sourceText" | "signal">>;

export interface StyleTransferApiOptions {
  service: StyleTransferService;
  prepareRequest: StyleTransferRequestPreparer;
  /** Authentication/authorization is mandatory and supplied by the host app. */
  authenticate: RequestHandler;
  /** Host-supplied rate limiter; use a shared store in multi-instance deployments. */
  rateLimit: RequestHandler;
  /** Optional shared job store when multiple model-specific routers serve the same base path. */
  jobStore?: Map<string, StyleTransferJobRecord>;
  /** @deprecated Legacy fields are ignored; text fields are no longer capped by the application. */
  maxSourceCharacters?: number;
  /** @deprecated Legacy fields are ignored; text fields are no longer capped by the application. */
  maxDonorCharacters?: number;
  onError?: (error: unknown) => void;
}

interface TransferBody {
  requestId?: unknown;
  sourceText?: unknown;
  donorText?: unknown;
  unfilteredMode?: unknown;
  styleIntensity?: unknown;
  customInstructions?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readBody(value: unknown):
  {
    ok: true;
    body: {
      requestId: string;
      sourceText: string;
      donorText: string;
      unfilteredMode: boolean;
      styleIntensity?: 1 | 2 | 3 | 4 | 5;
      customInstructions?: string;
    };
  } |
  { ok: false; message: string } {
  if (!isRecord(value)) return { ok: false, message: "Ожидался JSON-объект." };
  const body = value as TransferBody;
  if (typeof body.sourceText !== "string" || !body.sourceText.trim()) {
    return { ok: false, message: "Поле sourceText обязательно и должно содержать текст." };
  }
  if (typeof body.donorText !== "string" || !body.donorText.trim()) {
    return { ok: false, message: "Поле donorText обязательно и должно содержать текст-образец." };
  }
  const requestId = typeof body.requestId === "string" && body.requestId.trim()
    ? body.requestId.trim().slice(0, 128)
    : `style-transfer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const unfilteredMode = body.unfilteredMode === true;
  const rawIntensity = typeof body.styleIntensity === "number" && Number.isFinite(body.styleIntensity)
    ? Math.max(1, Math.min(5, Math.round(body.styleIntensity))) as 1 | 2 | 3 | 4 | 5
    : undefined;
  const customInstructions = typeof body.customInstructions === "string" && body.customInstructions.trim()
    ? body.customInstructions.trim()
    : undefined;
  return {
    ok: true,
    body: {
      requestId,
      sourceText: body.sourceText,
      donorText: body.donorText,
      unfilteredMode,
      ...(rawIntensity !== undefined ? { styleIntensity: rawIntensity } : {}),
      ...(customInstructions !== undefined ? { customInstructions } : {}),
    },
  };
}

function classifyRouterFailure(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof ModelRouterError) {
    const modelLabel = error.modelId ?? "Gemini";
    if (error.kind === "cancelled") {
      return {
        status: 408,
        code: "CANCELLED",
        message: "Запрос PROMPTGPT v2 отменён клиентом или превысил допустимое время ожидания.",
      };
    }
    if (error.kind === "timeout" || error.kind === "queue-timeout") {
      return {
        status: 504,
        code: "MODEL_TIMEOUT",
        message: `Превышено время ожидания ответа модели (${modelLabel}). Повторите попытку.`,
      };
    }
    if (error.kind === "rate-limit" || error.kind === "quota-exhausted") {
      return {
        status: 429,
        code: "RATE_LIMITED_UPSTREAM",
        message: `Превышен лимит запросов или квота модели (${modelLabel}): ${error.message.slice(0, 300)}`,
      };
    }
    if (error.kind === "unavailable") {
      return {
        status: 503,
        code: "MODEL_UNAVAILABLE",
        message: `Серверы модели (${modelLabel}) временно перегружены или недоступны (503). Повторите попытку через несколько секунд или выберите другой движок.`,
      };
    }
    if (error.kind === "network") {
      return {
        status: 502,
        code: "UPSTREAM_NETWORK_ERROR",
        message: `Сетевой сбой при обращении к модели (${modelLabel}). Повторите попытку.`,
      };
    }
    if (error.kind === "invalid-auth") {
      return {
        status: 502,
        code: "UPSTREAM_AUTH_ERROR",
        message: "Ошибка авторизации Gemini API на сервере (проверьте GEMINI_API_KEY).",
      };
    }
    return {
      status: 502,
      code: "UPSTREAM_MODEL_ERROR",
      message: `Ошибка модели (${modelLabel}): ${error.message.slice(0, 400)}`,
    };
  }
  if (error instanceof Error && error.message.trim()) {
    const raw = error.message.trim().slice(0, 800);
    if (/Request preparation was cancelled/i.test(raw)) {
      return {
        status: 408,
        code: "CANCELLED",
        message: "Подготовка запроса PROMPTGPT v2 отменена до завершения.",
      };
    }
    if (/Donor corpus is (?:insufficient|limited)|Semantic (?:extraction|completeness|interpretation|structure|inventory)|Logical relation/i.test(raw)) {
      return {
        status: 422,
        code: "PREPARATION_FAILED",
        message: `Подготовка PROMPTGPT v2 остановлена проверкой: ${raw}`,
      };
    }
    return {
      status: 500,
      code: "STYLE_TRANSFER_API_ERROR",
      message: `Не удалось выполнить перенос стиля: ${raw}`,
    };
  }
  return {
    status: 500,
    code: "STYLE_TRANSFER_API_ERROR",
    message: "Не удалось выполнить перенос стиля.",
  };
}

/**
 * Creates an isolated Express 4 router. Mount it explicitly from a host server;
 * this module does not import, mutate, or start the legacy server.
 */
export function createStyleTransferApiRouter(options: StyleTransferApiOptions): Router {
  if (!options || typeof options.prepareRequest !== "function" ||
      typeof options.authenticate !== "function" || typeof options.rateLimit !== "function" || !options.service) {
    throw new Error("Style-transfer API requires a service, server-side preparer, authentication middleware and rate limiter.");
  }

  const jobs = options.jobStore ?? new Map<string, StyleTransferJobRecord>();
  const JOB_TTL_MS = 30 * 60 * 1000;
  const JOB_MAX_ENTRIES = 100;
  const JOB_BACKGROUND_TIMEOUT_MS = 12 * 60 * 1000;

  const pruneJobs = () => {
    const now = Date.now();
    for (const [id, entry] of jobs) {
      if (entry.status !== "running" && now - entry.updatedAt > JOB_TTL_MS) {
        jobs.delete(id);
      }
    }
    while (jobs.size > JOB_MAX_ENTRIES) {
      const oldest = jobs.keys().next().value;
      if (oldest === undefined) break;
      jobs.delete(oldest);
    }
  };

  const router = express.Router();
  router.post(
    "/jobs",
    options.authenticate,
    options.rateLimit,
    express.json({ limit: Number.MAX_SAFE_INTEGER, strict: true, type: "application/json" }),
    async (req: Request, res: Response) => {
      const parsed = readBody(req.body);
      if (!parsed.ok) return res.status(400).json({ error: { code: "INVALID_REQUEST", message: parsed.message } });

      pruneJobs();
      const jobId = `v2job-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
      const record: StyleTransferJobRecord = {
        jobId,
        requestId: parsed.body.requestId,
        status: "running",
        stage: "preparing",
        startedAt: Date.now(),
        updatedAt: Date.now(),
      };
      jobs.set(jobId, record);

      const jobController = new AbortController();
      const jobTimer = setTimeout(() => {
        jobController.abort(new Error("Background job exceeded maximum runtime limit."));
      }, JOB_BACKGROUND_TIMEOUT_MS);

      void (async () => {
        try {
          const prepared = await options.prepareRequest({
            ...parsed.body,
            signal: jobController.signal,
          });
          if (jobController.signal.aborted) {
            throw new Error("Request preparation was cancelled.");
          }
          record.stage = "executing";
          record.updatedAt = Date.now();
          const generationOverrides =
            parsed.body.styleIntensity !== undefined || parsed.body.customInstructions !== undefined
              ? {
                  ...prepared.generation,
                  ...(parsed.body.styleIntensity !== undefined ? { styleIntensity: parsed.body.styleIntensity } : {}),
                  ...(parsed.body.customInstructions !== undefined ? { customInstructions: parsed.body.customInstructions } : {}),
                }
              : prepared.generation;
          const result = await options.service.execute({
            ...prepared,
            ...(generationOverrides ? { generation: generationOverrides } : {}),
            requestId: parsed.body.requestId,
            sourceText: parsed.body.sourceText,
            unfilteredMode: parsed.body.unfilteredMode,
            signal: jobController.signal,
          });
          const finishedAt = Date.now();
          const status = result.status === "accepted" || result.status === "needs-review" || Boolean(result.bestAvailableText?.trim())
            ? 200
            : result.status === "cancelled" ? 408 : 422;
          record.status = "completed";
          record.stage = "completed";
          record.httpStatus = status;
          record.completedAt = finishedAt;
          record.result = {
            ...result,
            totalDurationMs: result.totalDurationMs ?? Math.max(0, finishedAt - record.startedAt),
          };
          record.updatedAt = finishedAt;
        } catch (error) {
          options.onError?.(error);
          const classified = classifyRouterFailure(error);
          const finishedAt = Date.now();
          record.status = "failed";
          record.stage = "failed";
          record.httpStatus = classified.status;
          record.completedAt = finishedAt;
          record.error = { code: classified.code, message: classified.message };
          record.updatedAt = finishedAt;
        } finally {
          clearTimeout(jobTimer);
        }
      })();

      return res.status(202).json({
        jobId,
        requestId: record.requestId,
        status: record.status,
        stage: record.stage,
      });
    },
  );

  router.get(
    "/jobs/:jobId",
    options.authenticate,
    (req: Request, res: Response) => {
      const jobId = String(req.params.jobId || "").trim();
      const record = jobId ? jobs.get(jobId) : undefined;
      if (!record) {
        return res.status(404).json({
          error: { code: "JOB_NOT_FOUND", message: "Задача PROMPTGPT v2 не найдена или истёк срок её хранения." },
        });
      }
      const elapsedMs = Math.max(0, (record.completedAt ?? Date.now()) - record.startedAt);
      if (record.status === "running") {
        return res.status(200).json({
          jobId: record.jobId,
          requestId: record.requestId,
          status: record.status,
          stage: record.stage,
          elapsedMs,
        });
      }
      if (record.status === "completed") {
        return res.status(200).json({
          jobId: record.jobId,
          requestId: record.requestId,
          status: record.status,
          stage: record.stage,
          httpStatus: record.httpStatus ?? 200,
          elapsedMs,
          result: record.result,
        });
      }
      return res.status(200).json({
        jobId: record.jobId,
        requestId: record.requestId,
        status: record.status,
        stage: record.stage,
        httpStatus: record.httpStatus ?? 500,
        elapsedMs,
        error: record.error ?? { code: "STYLE_TRANSFER_API_ERROR", message: "Не удалось выполнить перенос стиля." },
      });
    },
  );

  router.post(
    "/",
    options.authenticate,
    options.rateLimit,
    // No application-level source/donor size cap. Runtime memory and upstream model limits still apply.
    express.json({ limit: Number.MAX_SAFE_INTEGER, strict: true, type: "application/json" }),
    async (req: Request, res: Response) => {
      const parsed = readBody(req.body);
      if (!parsed.ok) return res.status(400).json({ error: { code: "INVALID_REQUEST", message: parsed.message } });

      const controller = new AbortController();
      const requestStartedAt = Date.now();
      const logConnectionState = (event: "request-aborted" | "response-close" | "response-finish") => {
        const state = {
          event,
          requestId: parsed.body.requestId ?? null,
          elapsedMs: Date.now() - requestStartedAt,
          requestComplete: req.complete,
          responseHeadersSent: res.headersSent,
          responseWritableEnded: res.writableEnded,
          responseWritableFinished: res.writableFinished,
          socketDestroyed: req.socket.destroyed,
          socketBytesRead: req.socket.bytesRead,
          socketBytesWritten: req.socket.bytesWritten,
        };
        if (event === "response-finish") {
          console.info("[PROMPTGPT v2 API] Request response finished.", state);
          return;
        }
        console.warn("[PROMPTGPT v2 API] Client connection interrupted.", state);
        if (!res.writableFinished && !controller.signal.aborted) {
          controller.abort(new Error(`Client connection interrupted: ${event}.`));
        }
      };
      const onRequestAborted = () => logConnectionState("request-aborted");
      const onResponseClose = () => {
        if (!res.writableFinished) logConnectionState("response-close");
      };
      const onResponseFinish = () => logConnectionState("response-finish");
      req.once("aborted", onRequestAborted);
      res.once("close", onResponseClose);
      res.once("finish", onResponseFinish);

      try {
        const prepared = await options.prepareRequest({
          ...parsed.body,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const generationOverrides =
          parsed.body.styleIntensity !== undefined || parsed.body.customInstructions !== undefined
            ? {
                ...prepared.generation,
                ...(parsed.body.styleIntensity !== undefined ? { styleIntensity: parsed.body.styleIntensity } : {}),
                ...(parsed.body.customInstructions !== undefined ? { customInstructions: parsed.body.customInstructions } : {}),
              }
            : prepared.generation;
        const result = await options.service.execute({
          ...prepared,
          ...(generationOverrides ? { generation: generationOverrides } : {}),
          requestId: parsed.body.requestId,
          sourceText: parsed.body.sourceText,
          unfilteredMode: parsed.body.unfilteredMode,
          signal: controller.signal,
        });
        if (!res.headersSent && !res.writableEnded) {
          const status = result.status === "accepted" || result.status === "needs-review" || Boolean(result.bestAvailableText?.trim())
            ? 200
            : result.status === "cancelled" ? 408 : 422;
          return res.status(status).json(result);
        }
      } catch (error) {
        options.onError?.(error);
        if (!res.headersSent && !res.writableEnded) {
          const classified = classifyRouterFailure(error);
          return res.status(classified.status).json({
            error: { code: classified.code, message: classified.message },
          });
        }
      } finally {
        req.removeListener("aborted", onRequestAborted);
        res.removeListener("close", onResponseClose);
        res.removeListener("finish", onResponseFinish);
      }
    },
  );

  const parserErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = typeof error?.status === "number" ? error.status : 500;
    if (status === 413) {
      return res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Размер JSON-запроса превышает технические возможности сервера." } });
    }
    if (status === 400 || error?.type === "entity.parse.failed") {
      return res.status(400).json({ error: { code: "INVALID_JSON", message: "Тело запроса должно содержать корректный JSON." } });
    }
    options.onError?.(error);
    return res.status(500).json({ error: { code: "STYLE_TRANSFER_API_ERROR", message: "Не удалось обработать запрос." } });
  };
  router.use(parserErrorHandler);

  return router;
}
