import express, { type ErrorRequestHandler, type Request, type Response, type RequestHandler, type Router } from "express";
import type { StyleTransferService } from "../application/styleTransferService";
import type { StyleTransferRequest } from "../application/applicationTypes";

export interface StyleTransferPreparationInput {
  requestId: string;
  sourceText: string;
  donorText: string;
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
  maxSourceCharacters?: number;
  maxDonorCharacters?: number;
  onError?: (error: unknown) => void;
}

interface TransferBody {
  requestId?: unknown;
  sourceText?: unknown;
  donorText?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readBody(value: unknown, options: Required<Pick<StyleTransferApiOptions, "maxSourceCharacters" | "maxDonorCharacters">>):
  { ok: true; body: { requestId: string; sourceText: string; donorText: string } } |
  { ok: false; message: string } {
  if (!isRecord(value)) return { ok: false, message: "Ожидался JSON-объект." };
  const body = value as TransferBody;
  if (typeof body.sourceText !== "string" || !body.sourceText.trim()) {
    return { ok: false, message: "Поле sourceText обязательно и должно содержать текст." };
  }
  if (typeof body.donorText !== "string" || !body.donorText.trim()) {
    return { ok: false, message: "Поле donorText обязательно и должно содержать текст-образец." };
  }
  if (body.sourceText.length > options.maxSourceCharacters) {
    return { ok: false, message: `Исходный текст превышает лимит ${options.maxSourceCharacters} символов.` };
  }
  if (body.donorText.length > options.maxDonorCharacters) {
    return { ok: false, message: `Текст-образец превышает лимит ${options.maxDonorCharacters} символов.` };
  }
  const requestId = typeof body.requestId === "string" && body.requestId.trim()
    ? body.requestId.trim().slice(0, 128)
    : `style-transfer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return { ok: true, body: { requestId, sourceText: body.sourceText, donorText: body.donorText } };
}

/**
 * Creates an isolated Express 4 router. Mount it explicitly from a host server;
 * this module does not import, mutate, or start the legacy server.
 */
export function createStyleTransferApiRouter(options: StyleTransferApiOptions): Router {
  if (!options || typeof options.prepareRequest !== "function" ||
      typeof options.authenticate !== "function" || !options.service) {
    throw new Error("Style-transfer API requires a service, server-side preparer and authentication middleware.");
  }

  const maxSourceCharacters = options.maxSourceCharacters ?? 30_000;
  const maxDonorCharacters = options.maxDonorCharacters ?? 100_000;
  if (!Number.isInteger(maxSourceCharacters) || maxSourceCharacters < 1 ||
      !Number.isInteger(maxDonorCharacters) || maxDonorCharacters < 1) {
    throw new Error("Text limits must be positive integers.");
  }

  const router = express.Router();
  router.post(
    "/",
    options.authenticate,
    express.json({ limit: "768kb", strict: true, type: "application/json" }),
    async (req: Request, res: Response) => {
      const parsed = readBody(req.body, { maxSourceCharacters, maxDonorCharacters });
      if (!parsed.ok) return res.status(400).json({ error: { code: "INVALID_REQUEST", message: parsed.message } });

      const controller = new AbortController();
      const abortOnDisconnect = () => {
        if (!res.writableEnded) controller.abort(new Error("Client disconnected."));
      };
      req.once("aborted", abortOnDisconnect);
      res.once("close", abortOnDisconnect);

      try {
        const prepared = await options.prepareRequest({
          ...parsed.body,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const result = await options.service.execute({
          ...prepared,
          requestId: parsed.body.requestId,
          sourceText: parsed.body.sourceText,
          signal: controller.signal,
        });
        if (!res.headersSent && !res.writableEnded) {
          const status = result.status === "accepted" ? 200 :
            result.status === "needs-review" ? 200 :
            result.status === "cancelled" ? 408 : 422;
          return res.status(status).json(result);
        }
      } catch (error) {
        options.onError?.(error);
        if (!res.headersSent && !res.writableEnded) {
          return res.status(500).json({
            error: { code: "STYLE_TRANSFER_API_ERROR", message: "Не удалось выполнить перенос стиля." },
          });
        }
      } finally {
        req.removeListener("aborted", abortOnDisconnect);
        res.removeListener("close", abortOnDisconnect);
      }
    },
  );

  const parserErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = typeof error?.status === "number" ? error.status : 500;
    if (status === 413) {
      return res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Размер JSON-запроса превышает допустимый лимит." } });
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
